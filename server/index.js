import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import express from 'express';
import mysql from 'mysql2/promise';
import PDFDocument from 'pdfkit';

const app = express();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Set DATABASE_URL in .env before starting the API.');
const db = mysql.createPool({ uri: databaseUrl, timezone: 'Z' });
const deriveKey = promisify(scrypt);
const sessions = new Map();
const airports = ['DUB', 'LHR', 'CDG', 'AMS'];
const seats = Array.from({ length: 12 }, (_, row) =>
  [...'ABCDEF'].map(letter => String(row + 1) + letter),
).flat();
const flightColumns = 'id, flight_number, origin, destination, departures_at, arrives_at, price_cents';

app.use(express.json({ limit: '12kb' }));

function requireUser(req, res, next) {
  const token = req.get('Cookie')?.match(/(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const session = sessions.get(token);
  if (!session || session.expires <= Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Please sign in first.' });
  }
  req.userId = session.userId;
  req.sessionToken = token;
  next();
}

setInterval(() => {
  for (const [token, session] of sessions) {
    if (session.expires <= Date.now()) sessions.delete(token);
  }
}, 60_000).unref();

app.post('/api/auth/:action', async (req, res) => {
  const { action } = req.params;
  if (!['register', 'login'].includes(action)) return res.sendStatus(404);
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Enter a valid email and a password of 8 to 128 characters.' });
  }

  let userId;
  if (action === 'register') {
    const salt = randomBytes(16).toString('hex');
    const key = await deriveKey(password, salt, 64);
    try {
      const [result] = await db.execute('INSERT INTO users (email, password_hash) VALUES (?, ?)', [
        email, salt + ':' + key.toString('hex'),
      ]);
      userId = result.insertId;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      return res.status(409).json({ error: 'An account already exists for this email.' });
    }
  } else {
    const [[user]] = await db.execute('SELECT id, password_hash FROM users WHERE email = ?', [email]);
    const [salt, hash] = user?.password_hash.split(':') ?? ['00000000000000000000000000000000', '0'.repeat(128)];
    const key = await deriveKey(password, salt, 64);
    if (!timingSafeEqual(key, Buffer.from(hash, 'hex')) || !user) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    userId = user.id;
  }

  const token = randomBytes(32).toString('hex');
  const maxAge = 12 * 60 * 60 * 1000;
  sessions.set(token, { userId, expires: Date.now() + maxAge });
  res.cookie('session', token, {
    httpOnly: true, secure: process.env.SECURE_COOKIES === 'true', sameSite: 'strict', maxAge,
  });
  res.json({ email });
});

app.get('/api/me', requireUser, async (req, res) => {
  const [[user]] = await db.execute('SELECT email FROM users WHERE id = ?', [req.userId]);
  res.json(user);
});

app.post('/api/logout', requireUser, (req, res) => {
  sessions.delete(req.sessionToken);
  res.clearCookie('session');
  res.json({});
});

app.get('/api/flights', async (req, res) => {
  const { origin, destination, date } = req.query;
  if (!airports.includes(origin) || !airports.includes(destination) || origin === destination) {
    return res.status(400).json({ error: 'Choose two different airports.' });
  }
  if (date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
    return res.status(400).json({ error: 'Enter a valid travel date.' });
  }
  const dateFilter = date ? 'AND departures_at >= ? AND departures_at < DATE_ADD(?, INTERVAL 1 DAY)' : '';
  const [flights] = await db.execute(
    `SELECT ${flightColumns} FROM flights WHERE origin = ? AND destination = ?
     AND departures_at > UTC_TIMESTAMP() ${dateFilter} ORDER BY departures_at LIMIT 100`,
    date ? [origin, destination, date, date] : [origin, destination],
  );
  res.json(flights);
});

app.get('/api/flights/:id/seats', async (req, res) => {
  const [[flight]] = await db.execute('SELECT id FROM flights WHERE id = ? AND departures_at > UTC_TIMESTAMP()', [req.params.id]);
  if (!flight) return res.status(404).json({ error: 'This flight is unavailable.' });
  const [rows] = await db.execute('SELECT seat FROM bookings WHERE flight_id = ?', [flight.id]);
  const taken = new Set(rows.map(row => row.seat));
  res.json(seats.map(seat => ({ seat, available: !taken.has(seat) })));
});

app.post('/api/bookings', requireUser, async (req, res) => {
  const { flightId, seat } = req.body ?? {};
  const passenger = typeof req.body?.passenger === 'string' ? req.body.passenger.trim() : '';
  if (!Number.isSafeInteger(flightId) || !seats.includes(seat) || !passenger || passenger.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(passenger)) {
    return res.status(400).json({ error: 'Select a seat and enter the passenger name.' });
  }
  const reference = randomBytes(12).toString('hex').toUpperCase();
  try {
    const [result] = await db.execute(
      `INSERT INTO bookings (reference, user_id, flight_id, seat, passenger)
       SELECT ?, ?, id, ?, ? FROM flights WHERE id = ? AND departures_at > UTC_TIMESTAMP()`,
      [reference, req.userId, seat, passenger, flightId],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'This flight is unavailable.' });
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    return res.status(409).json({ error: 'This seat was just booked. Please select another one.' });
  }
  res.status(201).json({ reference });
});

const bookingQuery = `SELECT b.reference, b.passenger, b.seat, b.status,
  f.flight_number, f.origin, f.destination, f.departures_at, f.price_cents
  FROM bookings b JOIN flights f ON f.id = b.flight_id WHERE b.user_id = ?`;

app.get('/api/bookings', requireUser, async (req, res) => {
  const [rows] = await db.execute(bookingQuery + ' ORDER BY b.created_at DESC', [req.userId]);
  res.json(rows);
});

app.get('/api/bookings/:reference/ticket', requireUser, async (req, res) => {
  const [[booking]] = await db.execute(bookingQuery + ' AND b.reference = ?', [req.userId, req.params.reference]);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  res.attachment('TwinkToGo-' + booking.reference + '.pdf');
  const pdf = new PDFDocument({ size: 'A4', margin: 54 });
  pdf.pipe(res);
  pdf.fontSize(28).text('TwinkToGo');
  pdf.moveDown().fontSize(18).text(booking.origin + ' to ' + booking.destination);
  pdf.moveDown().fontSize(12);
  for (const [label, value] of Object.entries({
    Reference: booking.reference, Passenger: booking.passenger, Flight: booking.flight_number,
    Departure: booking.departures_at.toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    Seat: booking.seat, Status: 'Pending',
  })) pdf.text(label + ': ' + value);
  pdf.moveDown().text('Demo booking. No payment collected. Not valid for travel.');
  pdf.end();
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use(express.static(resolve('dist')));
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.status === 400 || error.status === 413) {
    return res.status(error.status).json({ error: 'Invalid request body.' });
  }
  console.error(error.code ?? error.name);
  res.status(500).json({ error: 'The service could not complete your request.' });
});

await db.query('SELECT 1');
const port = Number(process.env.PORT ?? 3001);
app.listen(port, '127.0.0.1', () => console.log('TwinkToGo API listening on http://localhost:' + port));
