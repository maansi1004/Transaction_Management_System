
# Transaction Management System

A backend-focused banking transaction management system built with **Node.js, Express.js, and MongoDB**. The project focuses on secure authentication, account management, fund transfers, and transaction record-keeping with an emphasis on consistency and reliability.

## Features

- **User Authentication:** User registration, login, JWT-based authentication, and logout.
- **Account Management:** Create accounts, retrieve user accounts, and check account balances.
- **Transaction Processing:** Transfer funds between accounts with account ownership and status validation.
- **Ledger Management:** Maintain debit and credit entries for financial activity.
- **Idempotent Transfers:** Use idempotency keys to help prevent duplicate transactions during retries.
- **Security:** Password hashing, protected routes, and token revocation through a token blacklist.
- **Email Notifications:** Email notifications for registration and transaction-related events.
- **System-Level Operations:** Support for authorized initial-fund transfers from system accounts.

## Tech Stack

- **Runtime:** Node.js
- **Backend Framework:** Express.js
- **Database:** MongoDB
- **ODM:** Mongoose
- **Authentication:** JSON Web Tokens (JWT)
- **Password Hashing:** bcrypt
- **Email Service:** Nodemailer

## Project Structure

```text
Transaction_Management_System/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── app.js
│   └── server.js
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js and npm
- MongoDB Atlas account or a compatible MongoDB deployment
- Git

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/maansi1004/Transaction_Management_System.git
   ```

2. Navigate to the project directory:

   ```bash
   cd Transaction_Management_System
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create a `.env` file in the location expected by your server configuration and configure the required environment variables:

   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_long_random_secret
   NODE_ENV=development
   ```

   Configure any additional environment variables required by the email service.

5. Start the server using the script configured in `package.json`. For example:

   ```bash
   npm start
   ```

   Ensure MongoDB is connected before testing database-dependent endpoints.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Log in a user |
| POST | `/api/auth/logout` | Log out an authenticated user |
| POST | `/api/accounts` | Create an account |
| GET | `/api/accounts` | Retrieve the authenticated user's accounts |
| GET | `/api/accounts/balance/:accountId` | Retrieve an account balance |
| POST | `/api/transactions` | Initiate a fund transfer |
| POST | `/api/transactions/system/initial-funds` | Initiate an authorized system-level fund transfer |

Request fields, authentication requirements, and response formats depend on the implemented route and controller logic.

## Design Considerations

- **Monetary Precision:** Store monetary values as integer minor units (paise for INR) to avoid floating-point arithmetic errors.
- **Account Ownership:** Verify that the authenticated user owns the source account before initiating a transfer.
- **Atomic Transfers:** Use database transactions to coordinate balance updates, transaction records, and ledger entries.
- **Idempotency:** Use idempotency keys to support safe retries and prevent duplicate transfers.
- **Auditability:** Maintain ledger entries for debit and credit operations.
- **Credential Security:** Keep database credentials, JWT secrets, and other sensitive configuration out of version control.


## Future Improvements

- Complete database integration and automated testing.
- Add Swagger/OpenAPI documentation.
- Introduce rate limiting and comprehensive request validation.
- Strengthen cookie-based authentication with CSRF protection where required.
- Add structured logging and transaction reconciliation.
- Implement reliable notification delivery and retry handling.

## Disclaimer

This project is intended for educational and portfolio purposes. It is not a production banking system and has not been independently audited for real-world financial use.
