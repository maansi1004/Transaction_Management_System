const express=require("express")
const authMiddleware=require("../middleware/auth.middleware")
const router=express.Router()
const accountController=require("../controllers/account.controller")
/* 
*- POST /api/accounts/
*-create a new acccount for the logged in user
*/
router.post("/",authMiddleware.authMiddleware,accountController.createAccountController)
/* GET /api/accounts
*-get all accounts for the logged in user
*/
router.get("/",authMiddleware.authMiddleware,accountController.getAllAccountsController)
/* GET /api/accounts/balance/:accountId
*-get balance for the given account id for the logged in user
*/
router.get("/balance/:accountId",authMiddleware.authMiddleware,accountController.getAccountBalanceController)
module.exports=router