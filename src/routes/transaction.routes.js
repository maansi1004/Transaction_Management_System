
const {Router} = require('express');
const authMiddleware=require("../middleware/auth.middleware")
const transactionController=require("../controllers/transaction.controller")
const TransactionRoutes=Router();
/*
*-POST /api/transactions
*/

transactionRoutes.post("/",authMiddleware.authMiddleware, transactionController.createTransaction)
transactionRoutes.post("/system/initial-funds",authMiddleware.authSystemUserMiddleware, transactionController.createInitialFunds)



module.exports=transactionRoutes;