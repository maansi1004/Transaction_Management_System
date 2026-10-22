# Fraud Scoring Service

Standalone FastAPI microservice. Called by the Node.js backend
before committing any transfer.

## Setup

cd fraud-service
pip install -r requirements.txt

## Run

uvicorn main:app --reload --port 8000

## Environment

Create a .env file:
  MONGO_URI=mongodb://localhost:27017/banking

## API

POST /score
  Body: { transaction_id, from_account_id, to_account_id,
          initiated_by, amount_minor, initiated_at }
  Returns: { score, label, reasons, block }

GET /health