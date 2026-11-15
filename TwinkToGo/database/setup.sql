CREATE DATABASE IF NOT EXISTS twinktogo CHARACTER SET utf8mb4;
USE twinktogo;

CREATE TABLE IF NOT EXISTS flights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  flight_number VARCHAR(12) NOT NULL,
  origin CHAR(3) NOT NULL,
  destination CHAR(3) NOT NULL,
  departures_at DATETIME NOT NULL,
  arrives_at DATETIME NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  UNIQUE KEY flight_departure (flight_number, departures_at),
  KEY route_departure (origin, destination, departures_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
  reference CHAR(24) PRIMARY KEY,
  user_id INT NOT NULL,
  flight_id INT NOT NULL,
  seat VARCHAR(4) NOT NULL,
  passenger VARCHAR(100) NOT NULL,
  status ENUM('pending') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY flight_seat (flight_id, seat),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (flight_id) REFERENCES flights(id)
) ENGINE=InnoDB;

INSERT IGNORE INTO flights
  (flight_number, origin, destination, departures_at, arrives_at, price_cents)
SELECT routes.number, routes.origin, routes.destination,
       TIMESTAMP(DATE_ADD(UTC_DATE(), INTERVAL days.n DAY), routes.departure),
       TIMESTAMP(DATE_ADD(UTC_DATE(), INTERVAL days.n DAY), routes.arrival),
       routes.price
FROM (
  SELECT 'TT101' AS number, 'DUB' AS origin, 'LHR' AS destination,
         '08:10:00' AS departure, '09:35:00' AS arrival, 5900 AS price
  UNION ALL SELECT 'TT105', 'DUB', 'LHR', '16:30:00', '17:55:00', 7900
  UNION ALL SELECT 'TT201', 'DUB', 'CDG', '11:15:00', '13:05:00', 8900
  UNION ALL SELECT 'TT301', 'DUB', 'AMS', '14:20:00', '16:00:00', 9900
  UNION ALL SELECT 'TT102', 'LHR', 'DUB', '10:30:00', '11:55:00', 6500
) AS routes
CROSS JOIN (
  SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
) AS days;
