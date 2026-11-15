# TwinkToGo

TwinkToGo is a flight booking portfolio project built with React, Node.js and MySQL. This implementation was rebuilt from the feature list of the original Software Engineering capstone at National Transport University.

## What you can do

- Search for sample flights by origin, destination and optional departure date.
- Create an account, sign in and select an available seat.
- Save a pending reservation and view it under My bookings.
- Download a PDF with the booking reference, flight details and seat.

The flight schedule is fictional. The application uses UTC for schedule times and leaves reservations pending without collecting payments.

## Run locally

Install Node.js 22 or later with npm, and MySQL 8. Use a MySQL account with permission to create the schema to run the setup script.

```sh
npm install
mysql -u root -p
```

At the MySQL prompt, run the following from the repository directory.

```sql
SOURCE database/setup.sql;
EXIT;
```

Copy `.env.example` to `.env` and set `DATABASE_URL` to the connection string for a local MySQL user with read and write access to the `twinktogo` database. URL-encode special characters in the username and password. Keep port 3001 for local development so the Vite proxy can reach the API.

Start the API and Vite in separate terminals.

```sh
npm run api
```

```sh
npm run dev
```

Open the URL printed by Vite. Search for **Dublin (DUB) → London Heathrow (LHR)** and leave the date blank. The seed script adds sample flights for the seven days after it runs. Run it again to refresh the available dates.

To run a production build locally, run `npm run build` followed by `npm start`, then open `http://localhost:3001`.

## How it works

React renders the search, seat selection and booking screens. Express serves the API and PDFKit generates tickets. MySQL stores flights, accounts and bookings. A unique database key on the flight and seat prevents two passengers from booking the same seat. Passwords are hashed with scrypt. Sign-in sessions are kept in memory and expire after 12 hours or when the server restarts.
