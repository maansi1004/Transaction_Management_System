const express=require("express")
const authMiddleware=require("../middleware/auth.middleware")
const router=express.Router()
const accountController=require("../controllers/account.controller")
/* 
*- POST /api/accounts/
*-
*/
router.post("/",authMiddleware.authMiddleware)
router.post("/",accountController.createAccountController)
module.exports=router