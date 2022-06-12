var express = require('express');
var router = express.Router();

const sessionController = require('../controllers/session');
const userController = require('../controllers/user');

// Autoload
router.param('userId', userController.load);
// autologout
router.all('*',sessionController.deleteExpiredUserSession);

const multer = require('multer');
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: {fileSize: 20 * 1024 * 1024}}
);

const postController = require('../controllers/post');


/* GET home page. */
router.get('/', function(req, res, next) {
   res.render('index', { title: 'Express' });
});

router.get('/author', function(req, res, next) {
  res.render('author', { title: 'CV' });
});

router.param('postId', postController.load);

router.get('/posts',                       sessionController.loginRequired,postController.index);
router.get('/posts/:postId(\\d+)',         sessionController.loginRequired,postController.show);
router.get('/posts/new',                   sessionController.loginRequired,postController.new);
router.post('/posts',                      sessionController.loginRequired,upload.single('image'),postController.create);
router.get('/posts/:postId(\\d+)/edit',    sessionController.loginRequired,postController.adminOrAuthorRequired,postController.edit);
router.put('/posts/:postId(\\d+)',         sessionController.loginRequired,postController.adminOrAuthorRequired,upload.single('image'),postController.update);
router.delete('/posts/:postId(\\d+)',      sessionController.loginRequired,postController.adminOrAuthorRequired,postController.destroy);

router.get('/posts/:postId(\\d+)/attachment', postController.attachment);

/* GET /error */
router.get('/error', postController.err);
/* GET /info */
router.get('/info', postController.inf);

// Routes for the resource /session
router.get('/login',    sessionController.new);     // login form
router.post('/login',   sessionController.create);  // create sesion
router.delete('/login', sessionController.destroy); // close sesion

// Routes for the resource /users
router.get('/users',                    sessionController.loginRequired,sessionController.adminRequired,userController.index);
router.get('/users/:userId(\\d+)',      sessionController.loginRequired,sessionController.adminOrMyselfRequired,userController.show);
router.get('/users/new',                sessionController.loginRequired,sessionController.adminRequired,userController.new);
router.post('/users',                   sessionController.loginRequired,sessionController.adminRequired,userController.create);
router.get('/users/:userId(\\d+)/edit', sessionController.loginRequired,sessionController.adminOrMyselfRequired,userController.edit);
router.put('/users/:userId(\\d+)',      sessionController.loginRequired,sessionController.adminOrMyselfRequired,userController.update);
router.delete('/users/:userId(\\d+)',   sessionController.loginRequired,sessionController.adminOrMyselfRequired,userController.destroy);


module.exports = router;