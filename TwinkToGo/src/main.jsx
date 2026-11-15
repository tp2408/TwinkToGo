import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const airports = { DUB: 'Dublin', LHR: 'London Heathrow', CDG: 'Paris Charles de Gaulle', AMS: 'Amsterdam' };
const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const dateTime = new Intl.DateTimeFormat('en-IE', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
});

async function api(path, body) {
  const response = await fetch('/api' + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error ?? 'Request failed.'), { status: response.status });
  return result;
}

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('search');
  const [authMode, setAuthMode] = useState('login');
  const [flights, setFlights] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [flight, setFlight] = useState(null);
  const [seats, setSeats] = useState([]);
  const [seat, setSeat] = useState('');
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/me').then(setUser).catch(error => {
      if (error.status !== 401) setStatus(error.message);
    });
  }, []);

  async function run(action) {
    setBusy(true);
    setStatus('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function show(next) {
    setStatus('');
    setNotice('');
    setView(next);
  }

  async function loadBookings() {
    setBookings(await api('/bookings'));
    setView('bookings');
  }

  function fields(event) {
    event.preventDefault();
    return Object.fromEntries(new FormData(event.currentTarget));
  }

  function search(event) {
    const criteria = fields(event);
    run(async () => setFlights(await api('/flights?' + new URLSearchParams(criteria))));
  }

  function selectFlight(selected) {
    run(async () => {
      setSeats(await api('/flights/' + selected.id + '/seats'));
      setSeat('');
      setFlight(selected);
      setView(user ? 'booking' : 'auth');
    });
  }

  function authenticate(event) {
    const credentials = fields(event);
    run(async () => {
      setUser(await api('/auth/' + authMode, credentials));
      setView(flight ? 'booking' : 'search');
    });
  }

  function book(event) {
    const { passenger } = fields(event);
    run(async () => {
      let booking;
      try {
        booking = await api('/bookings', { flightId: flight.id, passenger, seat });
      } catch (error) {
        if (error.status === 409) {
          setSeat('');
          setSeats(await api('/flights/' + flight.id + '/seats'));
        }
        throw error;
      }
      setFlight(null);
      setBookings([]);
      setView('bookings');
      setNotice('Booking saved. Reference: ' + booking.reference);
      await loadBookings();
    });
  }

  return (
    <>
      <header>
        <button className="brand" disabled={busy} onClick={() => show('search')}>TwinkToGo</button>
        <nav aria-label="Main navigation">
          {user ? <>
            <button disabled={busy} onClick={() => run(loadBookings)}>My bookings</button>
            <button disabled={busy} onClick={() => run(async () => {
              await api('/logout', {});
              setUser(null);
              setFlight(null);
              setBookings([]);
              setView('search');
            })}>Sign out</button>
          </> : <button disabled={busy} onClick={() => { setFlight(null); show('auth'); }}>Sign in</button>}
        </nav>
      </header>
      <main aria-busy={busy}>
        {status && <p className="message error" role="alert">{status}</p>}
        {notice && <p className="message" role="status">{notice}</p>}
        {view === 'search' && <>
          <h1>Find a flight</h1>
          <form className="search panel" onSubmit={search}>
            <label>From<select name="origin" defaultValue="DUB">{Object.entries(airports).map(([code, name]) =>
              <option key={code} value={code}>{name} ({code})</option>)}</select></label>
            <label>To<select name="destination" defaultValue="LHR">{Object.entries(airports).map(([code, name]) =>
              <option key={code} value={code}>{name} ({code})</option>)}</select></label>
            <label>Departure date (optional)<input type="date" name="date" /></label>
            <button className="primary" disabled={busy}>Search flights</button>
          </form>
          {flights?.length === 0 && <p>No flights found. Try a different date or route.</p>}
          {flights?.length > 0 && <section aria-label="Search results">
            <h2>Available flights</h2>
            {flights.map(item => <article className="result panel" key={item.id}>
              <div><strong>{item.origin} → {item.destination}</strong><small>{item.flight_number}</small></div>
              <div>{dateTime.format(new Date(item.departures_at))} UTC
                <small>Arrives {dateTime.format(new Date(item.arrives_at))} UTC</small></div>
              <strong>{euro.format(item.price_cents / 100)}</strong>
              <button className="primary" disabled={busy} onClick={() => selectFlight(item)}>Select flight</button>
            </article>)}
          </section>}
        </>}
        {view === 'auth' && <>
          <h1>{authMode === 'login' ? 'Sign in' : 'Create an account'}</h1>
          {flight && <p>Sign in or create an account to book {flight.origin} → {flight.destination}.</p>}
          <form className="stack panel narrow" onSubmit={authenticate}>
            <label>Email<input type="email" name="email" required autoComplete="email" /></label>
            <label>Password<input type="password" name="password" required minLength={8} maxLength={128}
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} /></label>
            <button className="primary" disabled={busy}>{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
            <button type="button" disabled={busy} onClick={() => {
              setStatus('');
              setAuthMode(authMode === 'login' ? 'register' : 'login');
            }}>{authMode === 'login' ? 'Create an account' : 'Already have an account? Sign in'}</button>
          </form>
        </>}
        {view === 'booking' && flight && <>
          <h1>Choose a seat</h1>
          <p>{flight.flight_number} · {flight.origin} → {flight.destination} · {dateTime.format(new Date(flight.departures_at))} UTC</p>
          <form className="stack panel narrow" onSubmit={book}>
            <label>Passenger name<input name="passenger" autoComplete="name" required maxLength={100} /></label>
            <div className="seats" role="group" aria-label="Seats">
              {seats.map(item => <button key={item.seat} type="button" disabled={!item.available || busy}
                aria-pressed={seat === item.seat} onClick={() => setSeat(item.seat)}>{item.seat}</button>)}
            </div>
            <button className="primary" disabled={!seat || busy}>Book{seat ? ' seat ' + seat : ''}</button>
          </form>
        </>}
        {view === 'bookings' && <>
          <h1>My bookings</h1>
          {!bookings.length && !notice && <p>You have no bookings yet.</p>}
          {bookings.map(item => <article className="result panel" key={item.reference}>
            <div><strong>{item.origin} → {item.destination}</strong><small>{item.flight_number} · Seat {item.seat}</small></div>
            <div>{item.passenger}<small>{dateTime.format(new Date(item.departures_at))} UTC · Pending</small></div>
            <a className="primary" href={'/api/bookings/' + item.reference + '/ticket'}>Download PDF</a>
          </article>)}
        </>}
      </main>
      <footer>Portfolio demo · Sample flights · No payment</footer>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
