const userModel=require("../models/user.model")
const jwt=require("jsonwebtoken")


async function authMiddleware(req,res,next){
    const token=req.cookies.token || req.headers.authorization?.split(" ")[1]
     if(!token){
        return res.status(401).json({
            message:"Unauthorized access, please login to continue"
        })
     }
     try{
        const decoded=jwt.verify(token,process.env.JWT_SECRET) //get the userId from the token, verify the token then find user details from database and add it to req object so that we can access it in the next middleware or controller
const user=await userModel.findById(decoded.userId)
req.user=user //adding user to req object so that we can access it in the next middleware or controller
     
return next()
}catch(err){
return res.status(401).json({
    message:"Unauthorized access, please login to continue"
})
}
     }
     module.exports={authMiddleware
     }