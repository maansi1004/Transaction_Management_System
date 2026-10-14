const mongoose=require("mongoose")


const accountSchema=new mongoose.Schema({
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"user",
        required:[true,"Account must be associated with a user"],
        index:true //for searching a user using indexing
    },
    status:{
        type:String,
        enum:{
            values:["ACTIVE","FROZEN","CLOSED"],
            message:"Status can be either ACTIVE,FROZEN OR CLOSED"},
            default:"ACTIVE"
        
    },
    currency:{
type:String,
required:[true,"Currency is required for creating account"],
default:"INR"
    },
    timestamps:true
})
accountModel.index({user:1,status:1})//index created fr finding based on status, compound index (using id and field)
const accountModel=mongoose.model("account",accountSchema)

module.exports=accountModel

