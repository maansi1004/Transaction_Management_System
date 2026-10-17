const mongoose=require("mongoose")
const ledgermodel=require("./ledger.model")

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
accountSchema.methods.getBalance = async function(){
    //ledger is used to track the balance of the account, so we need to find the latest ledger entry for this account and return the balance from that entry,
    //ledger entriees for transaction type as debit are all added to the balance and for credit are subtracted from the balance, so we need to find the latest ledger entry for this account and return the balance from that entry
//aggregation pipeline to find the latest ledger entry for this account and return the balance from that entry
//find all acc whose id  matches with fromaccount and calculate balance fr that acc using debit entries-credit entries and return the balance
const balanceData=await ledgermodel.aggregate([
    {
        $match:{
            account: this._id
        }
    },
    {
        $group: {
            _id: null,
            totalDebit:{ $sum: { $cond: [ { $eq: ["$type", "DEBIT"] }, "$amount", 0 ] } },
            totalCredit:{ $sum: { $cond: [ { $eq: ["$type", "CREDIT"] }, "$amount", 0 ] } },
            balance: { $sum: "$amount" }
        }
    },
    {
        $project:{
            _id:0,
            balance: { $subtract: ["$totalDebit", "$totalCredit"] }
        }
    }
])
//a new user, if there are no ledger entries for this account, then the balance will be 0, so we need to return 0 as balance for new users
if(balanceData.length==0){
return 0
}
return balanceData[0].balance
}
const accountModel=mongoose.model("account",accountSchema)

module.exports=accountModel

