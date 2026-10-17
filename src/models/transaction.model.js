const mongoose=require("mongoose")

const transactionSchema=new mongoose.Schema({
fromAccount:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"account",
    required:[true,"From account is required"],
    index:true
},
toAccount:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"account",
    required:[true,"To account is required"],
    index:true
},
status:{
    type:String,
    enum:{
        values:["PENDING","SUCCESS","FAILED","Reversed"],
        message:"Status can be either PENDING,SUCCESS OR FAILED"},
        default:"PENDING"
},
idempotencyKey:{ //generated on client side always unique for each transaction, so that if the same request is sent again, it will not be processed again
    type:String,
    required:[true,"Idempotency key is required for transaction"],
    unique:true,
    index:true
},timestamps:true}
)


const transactionModel=mongoose.model("transaction",transactionSchema)

module.exports=transactionModel