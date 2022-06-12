var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var partials = require('express-partials');
var methodOverride = require('method-override');
var flash = require('express-flash');
var session = require('express-session');

var indexRouter = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Configuracion de la session para almacenarla en BBDD Redis.
app.use(session({secret: "Blog 2022",
                 resave: false,
                 saveUninitialized: true})
);

app.use(methodOverride('_method', {methods: ["POST", "GET"]}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(partials());

// Este middleware nos permite usar loginUser en las vistas (usando locals.loginUser)
// Debe añadirse antes que el indexRouter
app.use(function(req, res, next) {

  console.log(">>>>>>>>>>>>>>", req.session.loginUser);

  // To use req.loginUser in the views
  res.locals.loginUser = req.session.loginUser && {
    id: req.session.loginUser.id,
    username: req.session.loginUser.username,
    email: req.session.loginUser.email,
    isAdmin: req.session.loginUser.isAdmin
  };

  next();
});

p.use(session({ secret:'P9', resave: false, saveUninitialized: false }));
app.use(flash());

  // Crear un contador de peticiones HTTP
app.use((req, res, next)=>{
  if(req.session.contadorPeticionesHTTP){
    req.session.contadorPeticionesHTTP++;
  }
  else{
    req.session.contadorPeticionesHTTP = 1;
  }
  console.log(`CONTADOR PETICIONES HTTP: ${req.session.contadorPeticionesHTTP}`);
  res.locals.contadorPeticionesHTTP = req.session.contadorPeticionesHTTP;
  next();
});  

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
