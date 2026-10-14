const userModel=require("../models/user.model")
const jwt=require("jsonwebtoken")
/*
user register controller
POST /api/auth/register
*/
async function userRegisterController(req,res){
    const {email,password,name} =req.body
    const isExists=await userModel.findOne({
email:email//get and match the email from req body
    })
    //if emailfound
    if(isExists){
        return res.status(422).json({
            message:"user already exists with mail",
            status:"failed"
        })
    }
    const user=await userModel.create({
        email,password,name
    })
const token=jwt.sign({userId:user._id},process.env.JWT_SECRET,{expiresIn:"3d"})
res.cookie("token",token)
res.status(201).json({
    user:{
        _id:user._id,
        email:user.email,
        name:user.name
    },
    token
})
}
/** 
*-user Login Controller
*-POST /api/auth
*/
async function userLoginController(req,res){
    const {email,password}=req.body
    const user=await userModel.findOne({email}).select("+password");
    if(!user){
        return res.status(401).json({
            message:"Email or password is INVALID"
        })
    }
       const isValidPassword=await user.comparePassword(password)
       if(!isValidPassword){
        return res.status(401).json({
            message:"Email or password is INVALID"
        })
       }
       const token=jwt.sign({userId:user._id},process.env.JWT_SECRET,{expiresIn:"3d"})
res.cookie("token",token)
res.status(201).json({
    user:{
        _id:user._id,
        email:user.email,
        name:user.name
    },
    token
})
    }



module.exports={
    userRegisterController,
    userLoginController
}