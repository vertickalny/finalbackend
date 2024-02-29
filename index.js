const express = require('express');
const axios = require('axios');
const bcrypt = require("bcrypt");
const session = require("express-session");
const multer  = require('multer'); // Для обработки загруженных файлов
const MongoDbSession = require("connect-mongodb-session")(session);
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const i18next = require('i18next');
const middleware = require('i18next-http-middleware');
const Backend = require('i18next-node-fs-backend');

const fs = require('fs');
const path = require('path');

const util = require('util');
const unlinkAsync = util.promisify(fs.unlink);

const methodOverride = require('method-override');
const app = express();

// After initializing your Express app

const { User, DeletedUser, Post } = require('./src/config');
require('dotenv').config();

mongoose.connect(process.env.DB_CONNECTION_LINK, { 
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true
})
.then(() => console.log('Connected to MongoDB'))

const store = new MongoDbSession({
    uri: process.env.DB_CONNECTION_LINK,
    collection: 'sessions'
});


i18next
    .use(Backend)
    .use(middleware.LanguageDetector)
    .init({
        fallbackLng: 'en',
        preload: ['en', 'ru'],
        backend: {
            loadPath: __dirname + '/locales/{{lng}}.json',
        },
        detection: {
            order: ['session', 'querystring', 'cookie'],
            caches: ['cookie'],
            lookupSession: 'lang',
            lookupQuerystring: 'lang',
            lookupCookie: 'i18next',
            cookieMinutes: 10,
            cookieDomain: 'myDomain'
        },
    });



const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads');
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });

const loggeduser = {
    name: "",
    isAdmin: null
}


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static("public"));
app.use('/uploads', express.static('uploads'));
app.use(methodOverride('_method'));


app.use(session({
    secret: 'thisismysecretdonttellanyone',
    resave: false,
    saveUninitialized: false,
    store: store,
}));

app.use(middleware.handle(i18next));
app.use((req, res, next) => {
    let lang = req.session.lang || 'en';
    console.log(lang)
    req.i18n.changeLanguage(lang);
    next();
});

const isAuth = (req, res, next) => {
    if (req.session.isAuth) {
        next();
    } else {
        res.redirect('/login');
    }
}

const isAuthAdmin = (req, res, next) => {
    if (req.session.isAuthAdmin) {
        next();
    } else {
        res.redirect('/login');
    }
}




app.get("/login", (req,res) =>{
    res.render("login")
})

app.get("/signup", (req,res) =>{
    res.render("signup", {t: req.t})
})

function formatDate(date) {
    let d = new Date(date);
    let day = ('0' + d.getDate()).slice(-2);
    let month = ('0' + (d.getMonth() + 1)).slice(-2);
    let year = d.getFullYear();
    return `${day}.${month}.${year}`;
}


app.get("/",isAuth, async (req,res)=>{
    posts = await Post.find()

    console.log(req.sessions)
    res.render('home', {loggeduser, posts, formatDate});
    });



app.get('/editPost/:id',isAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const post = await Post.findById(id);
        console.log(post);
        res.render('editPost', { post, loggeduser });
        } catch (error) {
            res.status(500).send('Error editing post: ' + error.message);
        }
});
    

//admin page
app.get('/admin',isAuthAdmin, async (req, res) => {
    try {
        const users = await User.find()
        const deletedUsers = await DeletedUser.find()
        res.render('admin', { users, deletedUsers, loggeduser});
    } catch (error) {
        res.status(500).send("Internal Server Error");
    }
});

//add new user
app.get('/admin/new',isAuthAdmin, (req,res) =>{
    res.render("addNewUser")
})

//delete user
app.get('/admin/delete/:name',isAuthAdmin, async (req, res) => {
    try {
        // Find the user by ID
        const userForDelete = await User.findOne({name: req.params.name});

        if (!userForDelete) {
            return res.status(404).send('User not found');
        }

        const deletedData = {
            name: req.params.name,
            createdDate: userForDelete.createdDate,
            deletionDate: new Date()
        }

        await DeletedUser.insertMany(deletedData)

        await User.deleteOne(userForDelete);

        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/admin/edit/:name',isAuthAdmin, async (req, res) => {
    try {
        const user = await User.findOne({name: req.params.name});
        if (!user) {
            return res.status(404).send('User not found');
        }

        res.render('editUser', { user }); // Assuming you have an 'editUser' EJS view
    } catch (err) {
        console.error("Error occurred:", err);
        res.status(500).send('Server error');
    }
});

app.get('/music',isAuth, (req, res) => {
    res.render('search', { tracks: [], loggeduser});
});

app.get('/music-search', async (req, res) => {
    try {
        const trackName = req.query.track;
        const response = await axios.get(`https://api.deezer.com/search?q=${trackName}&apikey=${process.env.DEZEER_API_KEY}`);

        res.render('search', { tracks: response.data.data, loggeduser});
    } catch (error) {
        res.send('Error occurred');
    }
});

app.get('/artist',isAuth, (req, res) => {
    res.render('artists', { artists: [], loggeduser});
});

app.get('/artist-result',isAuth, async (req, res) => {
    try {
        const searchTerm = req.query.artist;
        const authResponse = await axios.post('https://accounts.spotify.com/api/token', null, {
            params: {
                grant_type: 'client_credentials'
            },
            headers: {
                Authorization: `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`
            }
        });
        const accessToken = authResponse.data.access_token;
        
        const response = await axios.get(`https://api.spotify.com/v1/search?q=${searchTerm}&type=artist`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        res.render('artists', { artists: response.data.artists.items, loggeduser});
    } catch (error) {
        console.error(error);
        res.send('Error occurred');
    }
});


app.get('/newpost', isAuth,(req, res) => {
    res.render('newpost', {loggeduser});
});
app.post('/newpost', upload.array('images', 3), async (req, res) => {
    try {
        // Extract paths to the uploaded images
        const pathsToImages = req.files.map(file => file.path);

        // Create a new post instance based on the schema
        const newPost = new Post({
            images: pathsToImages,
            name: req.body.postName,
            description: req.body.description,
            createdAt: new Date(),
        });

        // Save the post to the database
        const savedPost = await newPost.save();

        // Send a successful response
        // res.status(201).send(savedPost);
        res.redirect('/');
    } catch (err) {
        // Handle errors when saving the post
        console.error('Failed to create new post:', err);
        res.status(500).send('Failed to create new post');
    }
});



// DELETE route to delete a post
app.delete('/deletePost/:id',isAuth, async (req, res) => {
    try {
        const id = req.params.id;
        await Post.findByIdAndDelete(id);
        res.redirect('/');
    } catch (error) {
        res.status(500).send('Error deleting post: ' + error.message);
    }
});

// PUT route to update a post
app.put('/editPost/:id', upload.array('images', 3), async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).send('Post not found');
        }

        // Delete existing images
        if (post.images && post.images.length > 0) {
            await Promise.all(post.images.map(async (imagePath) => {
                try {
                    await unlinkAsync(imagePath);
                } catch (error) {
                    console.error('Error deleting image:', error);
                }
            }));
        }

        // Update post details
        const updatedData = req.body;
        post.updatedAt = new Date();
        post.name = updatedData.postName;
        post.description = updatedData.description;

        // Add new images
        if (req.files && req.files.length > 0) {
            post.images = req.files.map(file => file.path);
        } else {
            post.images = []; // Clear images if no new files are uploaded
        }

        await post.save();
        res.redirect('/');
    } catch (error) {
        res.status(500).send('Error updating post: ' + error.message);
    }
});

// Route to handle the edit form submission
app.post('/admin/edit/:name',isAuthAdmin, async (req, res) => {
    try {
        // const { name, password, isAdmin } = req.body;
        let user = await User.findOne({name: req.params.name}); // search user
        if (!user) {
            return res.status(404).send('User not found');
        }
        if (req.params.name !== req.body.name){ // check the old and new username
            const existingUser = await User.findOne({name: req.body.name}) // check the new username
            if (existingUser) {
                return res.send("User already exists. Please choose another username.");

            }
        }

        const isAdminBoolean = req.body.isAdmin === 'on' ? true : false;
        const saltRounds = 10
        const hashedPassword = await bcrypt.hash(req.body.password, saltRounds)

        // Updating user details
        user.name = req.body.name;
        user.password = hashedPassword  // replace passwords // Consider encrypting the password
        user.updatedDate = new Date();
        user.isAdmin = isAdminBoolean;

        await user.save();
        res.redirect('/admin'); // Redirect to the dashboard or some other page

    } catch (err) {
        console.error("Error occurred:", err);
        res.status(500).send('Server error');
    }
});

//Register User
app.post("/signup", async (req,res)=>{
    const data = {
        name: req.body.username,
        password: req.body.password,
        createdDate: new Date(),
        updatedDate: new Date(),
        isAdmin: false
    }
    //check if the user already exists
    const existingUser = await User.findOne({name: data.name})
    if (existingUser){
        return res.send("User already exists. Please choose another username.");
    }else{
        // hash the password by using bcrypt
        
        const hashedPassword = await bcrypt.hash(data.password, 10)
        data.password = hashedPassword  // replace passwords
        const userData = await User.insertMany(data)
        // await data.save()
        console.log(userData)
        // place to redirect a user to login page
        res.redirect("/login");
    }

})

app.post('/admin/new',isAuthAdmin, async (req,res)=>{

    const data = {
        name: req.body.username,
        password: req.body.password,
        createdDate: new Date(),
        updatedDate: new Date(),
        isAdmin: false
    }
    //check if the user already exists
    const existingUser = await User.findOne({name: req.body.username})
    if (existingUser){
        return res.send("User already exists. Please choose another username.");
    }else{
        // hash the password by using bcrypt
        const saltRounds = 10
        const hashedPassword = await bcrypt.hash(data.password, saltRounds)
        data.password = hashedPassword  // replace passwords
        data.isAdmin = req.body.isAdmin === 'on' ? true : false;
        const userData = await User.insertMany(data)
        console.log(userData)
        // place to redirect a user to login page
        res.redirect("/admin");
    }

})

app.post("/login", async (req,res)=>{
    try {
        const user = await User.findOne({name: req.body.username})
        if(!user){
            res.send("Wrong username");
            return;
        }

        const isPasswordMatch = await bcrypt.compare(req.body.password, user.password);
        if(isPasswordMatch){

            loggeduser.name = user.name;
            loggeduser.isAdmin = user.isAdmin;
            req.session.isAuth = true;

            if (user.isAdmin){
                req.session.isAuthAdmin = true;
                res.redirect('/');
            } else {
                res.redirect('/');
            }
        } else {
            res.send("Wrong password");
        }
    } catch (error) {
        console.error("Error occurred:", error);
        res.send("Login Error");
    }
});





app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) throw err;
        res.redirect('/login');
    });
    
});



app.get('/change-lang/:lang', (req, res) => {
    const selectedLang = req.params.lang;
    console.log("Changing language to:", selectedLang); // Added logging
    req.session.lang = selectedLang;
    req.i18n.changeLanguage(selectedLang, (err) => {
        if (err) {
            console.error('Error changing language:', err);
            return res.status(500).send('Error changing language');
        }

        req.session.save(() => {
            const referrer = req.get('Referrer') || '/'
            res.redirect(referrer);
        });
    });
});


app.use((req, res, next) => {
    // res.status(404).send("Page Not Found");
    const ErrorCode = 404
    const ErrorMsg = "Page Not Found"
    res.render("error", {ErrorCode, ErrorMsg });
});

const port = 3000
app.listen(port, () =>{
    console.log(`Server running on Port: ${port}`)
})

