const mongoose=require("mongoose")
const bcrypt=require("bcryptjs")


//endpoints for register and login
const userSchema=new mongoose.Schema({
    email:{
        type:String,
        required:[true,"Email is required for creating a user"],
        trim:true,
        lowercase:true,
        match:[/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,],
        unique:[true,"Email aleady exists"]
    },
    name:{
        type:String,
        required:[true,"Name is required for creating account"],

    },
    password:{
        type:String,
        required:[true,"Password is required for creating account"],
        minlength:[6,"Password should not be more than 6 characters"],
        select:false
    },
    timestamps:true

    
})
userSchema.pre("save",async function(next){
//hashing password before storing
if(!this.isModified("password")){
    return  //if password changed in future 
}
const hash=await bcrypt.hash(this.password,10)
this.password=hash
return 
})
userSchema.methods.comparePassword=async function(password){
return await bcrypt.compare(password,this.password) //comparing password entered by user to hashed pswrd stored
}
const userModel=mongoose.model("user",userSchema)
model.exports=userModel