const accountModel=require("../models/account.model");
//we need to check if the request is from a valid logged in user , so check the token sent during register and check if its valid for user to be logged in
async function createAccountController(req,res){
    const user=req.user;
    const account=await accountModel.create({
        user:user._id,
    })
    res.status(201).json({
    account}) //create a account with given user id and return the account details to the user in response
}
async function getAllAccountsController(req,res){
    const accounts=await accountModel.find({
        user:req.user._id
    })
    res.status(200).json({
        accounts
    })
}
async function getAccountBalanceController(req,res){
    const {accountId}=req.params
    //check if the account belongs to the logged in user who wants to chk balance
    const account=await accountModel.findOne({
        _id:accountId,
        user:req.user._id
    })
    if(!account){
        return res.status(404).json({
            message:"Account not found"
        })
    }
    const balance=await account.getBalance() //get the balance for the given account id for the logged in user
    res.status(200).json({
        balance: account.balance
    })
}
module.exports={
    createAccountController,
    getAllAccountsController,
    getAccountBalanceController   
}