require('dotenv').config();
const mongoose = require("mongoose")
const connect = mongoose.connect(process.env.DB_CONNECTION_LINK)

connect.then(() => {
    console.log("Database connected Successfully")
})
.catch(()=>{
    console.log("Database cannot be connected")
})

// create a schema
const LoginSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    createdDate: {
        type: Date,
        required: true
    },
    updatedDate: {
        type: Date,
        required: true
    },
    isAdmin: {
        type: Boolean,
        required: true
    }
})

const deletedSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    createdDate: {
        type: Date,
        required: true
    },
    deletionDate: {
        type: Date,
        required: true
    }

})
const postShema = new mongoose.Schema({
    images: {
        type: [String],
        required: true
    },
   
    
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        required: true
    },
    updatedAt: {
        type: Date,
        required: false
    },
    deletedAt: {
        type: Date,
        required: false
    }
})

//collection part
const collection = new mongoose.model("users", LoginSchema)
const collection2 = new mongoose.model("deletedUsers", deletedSchema)
const collection3 = new mongoose.model("posts", postShema)
module.exports = {
    User: collection,
    DeletedUser: collection2,
    Post: collection3,
};
