
const {Router} = require('express');
const authMiddleware=require("../middleware/auth.middleware")
const transactionController=require("../controllers/transaction.controller")
const TransactionRoutes=Router();
/*
*-POST /api/transactions
*/
TransactionRoutes.post("/",authMiddleware.authMiddleware, transactionController.createTransaction)




module.exports=TransactionRoutes;