const express=require('express')
const cookieParser=require("cookie-parser")
/* routes required */
const authRouter=require("./routes/auth.routes")
const accountRouter=require("./routes/account.routes")
const app=express()

app.use(express.json())  //middleware
app.use(cookieParser())


/* routes used */
app.use("/api/auth",authRouter)
app.use("/api/accounts",accountRouter)
app.use("/api/transactions",transactionRoutes)
module.exports=app