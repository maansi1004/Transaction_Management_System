const userModel=require("../models/user.model")
const jwt=require("jsonwebtoken")
const tokenBlackListModel=require("../models/blackList.model")
async function authSystemUserMiddleware(req,res,next){
    const token=req.cookies.token || req.headers.authorization?.split(" ")[1]
        if(!token){ 
            return res.status(401).json({
                message:"Unauthorized access, please login to continue"
            })
        }
        const isBlacklisted = await tokenBlackListModel.findOne({ token });
        if (isBlacklisted) {
            return res.status(401).json({
                message:"Unauthorized access, please login to continue"
            })
        }
        try{
            const decoded=jwt.verify(token,process.env.JWT_SECRET) //get the userId from the token, verify the token then find user details from database and add it to req object so that we can access it in the next middleware or controller
    const user=await userModel.findById(decoded.userId).select("+systemUser") //selecting systemUser field to check if the user is a system user or not
    if(!user.systemUser){
        return res.status(403).json({
            message:"Unauthorized access, only system user can perform this action"
        })
    }
req.user=user //adding user to req object so that we can access it in the next middleware or controller
return next()
}catch(err){
    return res.status(401).json({
        message:"Unauthorized access, please login to continue"
    })
}
        }
//checks if the request has a valid token to proceed to the next middleware or controller, if not return unauthorized access error
async function authMiddleware(req,res,next){
    const token=req.cookies.token || req.headers.authorization?.split(" ")[1]
    const isBlacklisted = await tokenBlackListModel.findOne({ token });
   
     if(!token){
        return res.status(401).json({
            message:"Unauthorized access, please login to continue"
        })
     }
      if (isBlacklisted) {
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
     module.exports={authMiddleware, authSystemUserMiddleware
     }