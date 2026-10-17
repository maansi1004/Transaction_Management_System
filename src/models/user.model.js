
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, "Email is required"],
            trim: true,
            lowercase: true,
            maxlength: 254,
            unique: true,
            match: [
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                "Please provide a valid email address"
            ]
        },

        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            minlength: 2,
            maxlength: 80
        },

        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: 12,
            maxlength: 72,
            select: false
        },
balanceMinor: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
        validator: Number.isSafeInteger,
        message: "Balance must be a safe integer",
    },
},
        // Keep false for normal users.
        // Provision any system account separately.
        systemUser: {
            type: Boolean,
            default: false,
            immutable: true,
            select: false
        }
    },
    {
        timestamps: true
    }
);

// Hash only when the password is new or changed.
userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 12);
});

// Verify a submitted password against the saved hash.
userSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.password);
};

const userModel = mongoose.model("User", userSchema);

module.exports = userModel;
