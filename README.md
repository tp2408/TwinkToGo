TwinkToGo

A small flight booking app based on my final-year Software Engineering project. The original source code was unavailable, so this version was rebuilt with AI assistance from the project's feature list.

Search for a flight, create an account, choose a seat and save a booking. You can then find it under My bookings and download a PDF ticket.

The app uses sample flights. Bookings stay pending and no payment is taken. All flight times are shown in UTC.

React, CSS, Node.js, Express, MySQL and PDFKit.

You need Node.js 22 or newer with npm, and MySQL 8.

Open a terminal in the folder containing package.json and run:

npm install
mysql -u root -p

At the MySQL prompt:

SOURCE database/setup.sql;
EXIT;

Copy .env.example to .env. Set DATABASE_URL to your local MySQL connection string. Use an account with access to the twinktogo database. URL-encode special characters in its username or password.

Start the API:

npm run api

Open another terminal in the same folder and start the frontend:

npm run dev

Open the address printed by Vite. Keep the API on port 3001 with the default configuration.

Search from Dublin to London Heathrow with the date left blank.
Select a flight and create an account.
Enter a passenger name, select a seat and book.
Open My bookings and download the PDF.

The database script adds sample flights for the next seven days. Run it again when those dates have passed. It preserves existing accounts and bookings.

npm run build
npm start

The built app runs at http://localhost:3001.

This is a local portfolio demo. It has no live airline connection, payments, cancellations or password reset. Sessions last 12 hours and are cleared when the API restarts. Selecting a seat does not hold it. A database constraint prevents duplicate bookings for a seat.

The PDF uses a built-in font with limited support for names outside the Latin alphabet.

The server and Vite configuration passed Node syntax checks. API handler checks use a simulated database. The Vite build and a full run against MySQL remain unverified because the development environment could not download npm packages.
