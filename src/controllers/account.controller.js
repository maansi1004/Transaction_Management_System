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
module.exports={
    createAccountController
}