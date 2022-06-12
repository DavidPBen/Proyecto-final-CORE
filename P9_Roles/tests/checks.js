/* eslint-disable no-invalid-this*/
/* eslint-disable no-undef*/
const path = require("path");
const {log,has_failed,checkFileExists,create_browser,from_env,DEBUG,ROOT,path_assignment, warn_errors, scored, checkFilExists} = require("./testutils");
const fs = require("fs");
const net = require('net');
const spawn = require("child_process").spawn;
const util = require('util');
const exec = util.promisify(require("child_process").exec);
const Sequelize = require('sequelize');

const PATH_ASSIGNMENT = path_assignment("blog");
const URL = `file://${path.resolve(path.join(PATH_ASSIGNMENT.replace("%", "%25"), "cv.html"))}`;
// Should the server log be included in the logs?
const TIMEOUT =  parseInt(from_env("TIMEOUT", 6000));
const TEST_PORT =  parseInt(from_env("TEST_PORT", "3001"));

let browser = create_browser();

var server;


describe("Tests Práctica 9", function() {
    after(function () {
        warn_errors();
    });

    describe("Prechecks", function () {
	      scored(`Comprobando que existe la carpeta de la entrega: ${PATH_ASSIGNMENT}`,
               -1,
               async function () {
                   this.msg_err = `No se encontró la carpeta '${PATH_ASSIGNMENT}'`;
                   (await checkFileExists(PATH_ASSIGNMENT)).should.be.equal(true);
	             });

        scored(`Comprobar que se han añadido plantillas express-partials`, -1, async function () {
            this.msg_ok = 'Se incluye layout.ejs';
            this.msg_err = 'No se ha encontrado views/layout.ejs';
            fs.existsSync(path.join(PATH_ASSIGNMENT, "views", "layout.ejs")).should.be.equal(true);
        });

        scored(`Comprobar que la migración y el seeder para Usuarios existen (P7)`, -1, async function () {
            this.msg_ok = 'Se incluye la migración y el seeder';
            this.msg_err = "No se incluye la migración o el seeder";

            let mig = fs.readdirSync(path.join(PATH_ASSIGNMENT, "migrations")).filter(fn => fn.endsWith('-CreateUsersTable.js'));
            this.msg_err = `No se ha encontrado la migración`;

            (mig.length).should.be.equal(1);
            this.msg_err = `La migración no incluye el campo email`;
            log(mig[0]);
            let templ = fs.readFileSync(path.join(PATH_ASSIGNMENT, "migrations", mig[0]));
            /email/.test(templ).should.be.equal(true);


            let seed = fs.readdirSync(path.join(PATH_ASSIGNMENT, "seeders")).filter(fn => fn.endsWith('-FillUsersTable.js'));
            this.msg_err = 'No se ha encontrado el seeder';
            (seed.length).should.be.equal(1);
            // We could use a regex here to check the date
        });

        scored(`Comprobar que la migración añadir authorId existe`, -1, async function () {
            this.msg_ok = 'Se incluye la migración';
            this.msg_err = "No se incluye la migración o el seeder";

            let mig = fs.readdirSync(path.join(PATH_ASSIGNMENT, "migrations")).filter(fn => fn.endsWith('-AddAuthorIdToPostsTable.js'));
            this.msg_err = `No se ha encontrado la migración`;

            (mig.length).should.be.equal(1);
            this.msg_err = `La migración no incluye el campo authorId`;
            log(mig[0]);
            let templ = fs.readFileSync(path.join(PATH_ASSIGNMENT, "migrations", mig[0]));
            /authorId/.test(templ).should.be.equal(true);
        });

        scored(`Comprobar que los controladores existen`, -1, async function () {
            this.msg_ok = 'Se incluyen los controladores de usuarios y sesiones';
            this.msg_err = "No se incluye el controlador de usuarios";
            await checkFileExists(path.resolve(path.join(PATH_ASSIGNMENT, 'controllers', 'user')));
            this.msg_err = "No se incluye el controlador de sesiones";
            await checkFileExists(path.resolve(path.join(PATH_ASSIGNMENT, 'controllers', 'session')));
        });

        scored(`Comprobar que se ha añadido el código para incluir los comandos adecuados (P6)`, -1, async function () {
            let rawdata = fs.readFileSync(path.join(PATH_ASSIGNMENT, 'package.json'));
            let pack = JSON.parse(rawdata);
            this.msg_ok = 'Se incluyen todos los scripts/comandos';
            this.msg_err = 'No se han encontrado todos los scripts';
            scripts = {
                "super": "supervisor ./bin/www",
                "migrate": "sequelize db:migrate --url sqlite://$(pwd)/blog.sqlite",  
                "seed": "sequelize db:seed:all --url sqlite://$(pwd)/blog.sqlite",  
                "migrate_win": "sequelize db:migrate --url sqlite://%cd%/blog.sqlite",  
                "seed_win": "sequelize db:seed:all --url sqlite://%cd%/blog.sqlite"  ,
            };
            for(script in scripts){
                this.msg_err = `Falta el comando para ${script}`;
                pack.scripts[script].should.be.equal(scripts[script]);
            }
        });

    });

    describe("Tests funcionales", function () {
        var server;
        var sequelize;
        const db_filename = 'blog.sqlite';
        const db_file = path.resolve(path.join(ROOT, db_filename));

        const cookie_name = 'connect.sid';

        const users = {
            'admin': {id: 1, username: "admin", email: "admin@core.example", password: "1234"},
            'pepe': {id: 2, username: "pepe", email: "pepe@core.example", password: "5678"},
        };

        async function asUser(username, fn) {
            browser.deleteCookie(cookie_name);
            if (username) {
                let user = users[username];
                browser.setCookie(cookie_name, user.cookie);
            } else {
                username = "anónimo (sin login)";
            }
            try{
                await fn.apply(this, []);
            }catch(e){
                // Esta parte sólo funciona si se usa asUsers.apply(this, [argumentos]) siempre.
                // y allUsers.apply, si se usa dentro de esa función.
                if(!this.msg_err) {
                    this.msg_err = `Fallo con el usuario ${username}`;
                } else {
                    this.msg_err += `, con el usuario ${username}`;
                }
                log(browser.html());
                throw e;
            }
            browser.deleteCookie(cookie_name);
        }

        async function allUsers(fn) {
            for(var name in users) {
                await await asUser.apply(this, [name, async function () {
                    return fn.apply(this, [users[name]]);
                }]);
            }
        }

        before(async function() {
            if(has_failed()){
                return;
            }
            // Crear base de datos nueva y poblarla antes de los tests funcionales. por defecto, el servidor coge post.sqlite del CWD
            try {
                fs.unlinkSync(db_file);
                log('Previous test db removed. A new one is going to be created.')
            } catch {
                log('Previous test db does not exist. A new one is going to be created.')
            }
            fs.closeSync(fs.openSync(db_file, 'w'));

            let sequelize_cmd = path.join(PATH_ASSIGNMENT, "node_modules", ".bin", "sequelize")
            let db_url = `sqlite://${db_file}`;
            let db_relative_url = `sqlite://${db_filename}`;
            sequelize = new Sequelize(db_relative_url);
            await exec(`${sequelize_cmd} db:migrate --url "${db_url}" --migrations-path ${path.join(PATH_ASSIGNMENT, "migrations")}`);
            log('Lanzada la migración');
            await exec(`${sequelize_cmd} db:seed:all --url "${db_url}" --seeders-path ${path.join(PATH_ASSIGNMENT, "seeders")}`);
            log('Lanzado el seeder');


            let bin_path = path.join(PATH_ASSIGNMENT, "bin", "www");
            server = spawn('node', [bin_path], {env: {DEBUG: DEBUG, PORT: TEST_PORT, DATABASE_URL: db_relative_url}});
            server.stdout.setEncoding('utf-8');
            server.stdout.on('data', function(data) {
                log('Salida del servidor: ', data);
            });
            server.stderr.on('data', function (data) {
                log('EL SERVIDOR HA DADO UN ERROR. SALIDA stderr: ' + data);
            });
            log(`Lanzado el servidor en el puerto ${TEST_PORT}`);
            await new Promise(resolve => setTimeout(resolve, TIMEOUT));
            browser.site = `http://localhost:${TEST_PORT}/`;
            try{
                await browser.visit("/");
                browser.assert.status(200);
            }catch(e){
                console.log("No se ha podido contactar con el servidor.");
                throw new Error(e);
            }

            for(var key in users) {
                let user = users[key];

                await browser.visit("/login/");
                await browser.fill('username', user.username);
                await browser.fill('password', user.password);
                await browser.pressButton('Login');

                browser.html().includes(user.username).should.be.equal(true);

                user.cookie = browser.getCookie(cookie_name);
                browser.deleteCookie(cookie_name);
            }
        });

        after(async function() {
            // Borrar base de datos

            if(typeof server !== 'undefined') {
                await server.kill();
                function sleep(ms) {
                    return new Promise((resolve) => {
                        setTimeout(resolve, ms);
                    });
                }
                //wait for 1 second for the server to release the sqlite file
                await sleep(1000);
            }

            try {
                fs.unlinkSync(db_file);
            } catch(e){
                log("Test db not removed.");
                log(e);
            }
        });
        /*
         */

        scored(`No se puede publicar un post si no hay nadie logueado.`, 0.5 , async function(){
            await browser.visit("/posts/new");
            this.msg_err = 'Se muestra la página sin haber hecho login o no se redirecciona a login';
            browser.location.href.includes('/login').should.be.equal(true);
        });

        scored(`El botón de crear un post no aparece si no hay nadie logueado.`, 0.3, async function(){
            await asUser.apply(this, [null, async function(user) {
                await browser.visit("/posts/");
                this.msg_err = 'Se muestra el botón sin estar logueado';
                browser.html().includes("posts/new").should.be.equal(false);
            }]);
        });
        scored(`Se puede publicar un post si hay alguien logueado.`, 0.3, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                await browser.visit("/posts/new");
                this.msg_err = 'No se permite acceder estando logueado';
                browser.location.href.includes('/login').should.be.equal(false);
            }]);
        });
        scored(`El botón de crear un post aparece si hay alguien logueado.`, 0.3, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                await browser.visit("/posts/");
                this.msg_err = 'No se muestra el botón estando logueado';
                browser.html().includes("posts/new").should.be.equal(true);

            }]);
        });
        scored(`Un post no puede editarse si no hay nadie logueado.`, 0.2, async function(){
            await asUser.apply(this, [null, async function(user) {
                try {
                    await browser.visit("/posts/1/edit");
                }catch(e) {
                    browser.assert.status(403);
                    return;
                }
                browser.location.href.includes('/login').should.be.equal(true);
            }]);
        });

        scored(`El botón de editar un post no aparece si no hay nadie logueado.`, 0.2, async function(){ 
            await asUser.apply(this, [null, async function(user) {
                await browser.visit("/posts/1");
                this.msg_err = 'Se muestra la página sin haber hecho login o no se redirecciona a login';
                browser.html().includes('/edit').should.be.equal(false);
            }]);
        });

        scored(`Un post no puede editarse si el usuario logueado no es ni administrador, ni el autor del post.`, 0.2, async function(){
            await asUser.apply(this, ["pepe", async function(user) {
                try {
                    await browser.visit("/posts/1/edit");
                }catch(e) {
                    return;
                }
                this.msg_err = 'Se muestra la página sin ser el autor';
                throw new Error(this.msg_err);
            }]);
        });
        scored(`El botón de editar un post no aparece si el usuario logueado no es ni administrador, ni el autor del post.`, 0.2, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                await browser.visit("/posts/1");
                this.msg_err = 'Se muestra el botón sin ser el autor';
                browser.html().includes('/edit').should.be.equal(false);
            }]);
        });

        scored(`Un post puede ser editado por su autor.`, 0.2, async function(){ 
            await allUsers.apply(this, [async function(user) {
                this.msg_err = 'No se crea un nuevo post al mandar /posts/new';
                await browser.visit("/posts/new");
                browser.assert.status(200);

                this.msg_err = `La página /posts/new no incluye el formulario de creación de un post correcto`;
                browser.assert.element('#title');
                browser.assert.element('#body');
                browser.assert.element('#enviar');
                await browser.fill('#title',`Mi titulo usuario ${user.username}`);
                await browser.fill('#body', `Mi cuerpo usuario ${user.username}`);
                await browser.pressButton('#enviar');
                browser.assert.status(200);
                log("POST CREADO. URL devuelta: " + browser.location.href);
                browser.location.href.includes('/posts/').should.be.equal(true);
                const post_url = browser.location.href;
                await browser.visit(browser.location.href + '/edit');
                browser.assert.status(200);
                await browser.visit(post_url + '?_method=DELETE');
            }]);
        });
        scored(`El botón de editar un post aparece si el usuario logueado es el autor del post.`, 0.2, async function(){
            await allUsers.apply(this, [async function(user) {
                this.msg_err = 'No se crea un nuevo post al mandar /posts/new';
                await browser.visit("/posts/new");
                browser.assert.status(200);

                this.msg_err = `La página /posts/new no incluye el formulario de creación de un post correcto`;
                browser.assert.element('#title');
                browser.assert.element('#body');
                browser.assert.element('#enviar');
                await browser.fill('#title',`Mi titulo usuario ${user.username}`);
                await browser.fill('#body', `Mi cuerpo usuario ${user.username}`);
                await browser.pressButton('#enviar');
                browser.assert.status(200);
                const post_path = browser.location.pathname;
                await browser.visit("/posts");
                let html_txt = browser.html();
                log("POST CREADO. URL devuelta: " + post_path);
                await browser.visit(post_path);
                html_txt += browser.html();

                this.msg_err = "No se encuentra el botón de edición en el index o en show";
                html_txt.includes(post_path + '/edit').should.be.equal(true);
                // Intentar borrar para no molestar en el resto.
                try { 
                    await browser.visit(post_path + '?_method=DELETE');
                }catch (e){
                    log("No se pudo borrar el post", e)
                }
            }]);
        });

        scored(`Un post puede ser editado por un administrador.`, 0.2, async function(){ 
            await asUser.apply(this, ["admin", async function(user) {
                await browser.visit("/posts/1/edit");
                browser.assert.status(200);
                browser.location.href.includes("login").should.be.equal(false);
            }]);
        });
        scored(`El botón de editar un post aparece si el usuario logueado es un administrador.`, 0.2, async function(){
            await asUser.apply(this, ["admin", async function(user) {
                await browser.visit("/posts/1");
                this.msg_err = 'No se muestra el botón al admin';
                browser.html().includes('/edit').should.be.equal(true);
            }]);
        });


        scored(`Un post no puede borrarse si no hay nadie logueado.`, 0.2, async function(){ 
            await allUsers.apply(this, [async function(user) {
                if(user.username == 'admin') {
                    return;
                }
                this.msg_err = 'No se borra el post';
                try {
                    await browser.visit("/posts/1/?_method=DELETE");
                }catch(e) {
                    return;
                }
                throw new Error("Se pudo borrar el post, sin deber");
            }]);
        });

        scored(`El botón de borrar un post no aparece si no hay nadie logueado.`, 0.2, async function(){ 
            log(browser.html());
            await asUser.apply(this, [null, async function(user) {
                await browser.visit("/posts");
                this.msg_err = 'Se muestra sin haber hecho login o no se redirecciona a login';
                browser.html().includes('delete').should.be.equal(false);
            }]);
        });

        scored(`Un post no puede borrarse si el usuario logueado no es ni administrador, ni el autor del post.`, 0.2, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                try {
                    await browser.visit("/posts/1/?_method=DELETE");
                }catch(e) {
                    return;
                }
                this.msg_err = 'Se muestra la página sin ser el autor';
                throw new Error(this.msg_err);
            }]);
        });
        scored(`El botón de borrar un post no aparece si el usuario logueado no es ni administrador, ni el autor del post.`, 0.2, async function(){ 
              await asUser.apply(this, ["pepe", async function(user) {
                  await browser.visit("/posts/1/");
                  this.msg_err = 'Se muestra el botón sin ser el autor';
                  browser.html().includes('delete').should.be.equal(false);
              }]);
          });
        scored(`Un post puede ser borrado por su autor.`, 0.2, async function(){
            await allUsers.apply(this, [async function(user) {
                this.msg_err = 'No se crea un nuevo post al mandar /posts/new';
                await browser.visit("/posts/new");
                browser.assert.status(200);

                this.msg_err = `La página /posts/new no incluye el formulario de creación de un post correcto`;
                browser.assert.element('#title');
                browser.assert.element('#body');
                browser.assert.element('#enviar');
                await browser.fill('#title',`Mi titulo usuario ${user.username}`);
                await browser.fill('#body', `Mi cuerpo usuario ${user.username}`);
                await browser.pressButton('#enviar');
                browser.assert.status(200);
                log("POST CREADO. URL devuelta: " + browser.location.href);
                browser.location.href.includes('/posts/').should.be.equal(true);
                const post_url = browser.location.href;
                await browser.visit(post_url + '?_method=DELETE');
            }]);
        });
        scored(`El botón de borrar un post aparece si el usuario logueado es el autor del post.`, 0.2, async function(){
            await allUsers.apply(this, [async function(user) {
                this.msg_err = 'No se crea un nuevo post al mandar /posts/new';
                await browser.visit("/posts/new");
                browser.assert.status(200);

                this.msg_err = `La página /posts/new no incluye el formulario de creación de un post correcto`;
                browser.assert.element('#title');
                browser.assert.element('#body');
                browser.assert.element('#enviar');
                await browser.fill('#title',`Mi titulo usuario ${user.username}`);
                await browser.fill('#body', `Mi cuerpo usuario ${user.username}`);
                await browser.pressButton('#enviar');
                browser.assert.status(200);
                log("POST CREADO. URL devuelta: " + browser.location.href);
                this.msg_err = "La vista de edición del post no incluye un botón para borrarlo";
                browser.html().includes("DELETE").should.be.equal(true);
                await browser.visit(browser.location.href + '?_method=DELETE');
            }]);
        });
        scored(`Un post puede ser borrado por un administrador.`, 0.2, async function(){ 
            await asUser.apply(this, ["admin", async function(user) {
                this.msg_err = 'No permite borrar el post';
                await browser.visit("/posts/3/?_method=DELETE");
                browser.assert.status(200);
            }]);
            try {
            await browser.visit("/posts/3");
            }catch(e) {
                return
            }
            throw new Error("El post sigue estando disponible");
        });
          scored(`El botón de borrar un post aparece si el usuario logueado es un administrador.`, 0.2, async function(){
              await asUser.apply(this, ["admin", async function(user) {
                  await browser.visit("/posts/1");
                  browser.assert.status(200);
                  browser.html().includes("DELETE").should.be.equal(true);
              }]);
          });

          scored(`La peticion /users no está permitida si nadie está logueado.`, 0.2, async function(){ 
              await asUser.apply(this, [null, async function(user) {
                  try {
                      await browser.visit("/users");
                  }catch(e) {
                      browser.assert.status(403);
                      return;
                  }
                  this.msg_err = 'Debería redireccionarse a login o emitir un error 403';
                  browser.location.href.includes('/login').should.be.equal(true);
              }]);
          });
        scored(`La peticion /users no está permitida si el usuario logueado no es un administrador.`, 0.2, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                try { 
                    await browser.visit("/users");
                }catch(e) {
                    browser.assert.status(403);
                    return;
                }
                throw new Error("No debería permitirse");
            }]);
        });
          scored(`La peticion /users  está permitida si el usuario logueado  es un administrador.`, 0.2, async function(){ 
              await asUser.apply(this, ["admin", async function(user) {
                  await browser.visit("/users");
                  browser.assert.status(200);
              }]);
          });

        scored(`El boton /users de la barra de navegación no aparece si no hay nadie logueado.`, 0.2, async function(){ 
            await asUser.apply(this, [null, async function(user) {
                await browser.visit("/");
                browser.assert.elements('[href="/users"]', 0);
                // browser.html().includes('/users"').should.be.equal(false);
            }]);
        });

        scored(`El boton /users de la barra de navegación no aparece si el usuario logueado no es administrador.`, 0.2, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                await browser.visit("/");
                browser.assert.elements('[href="/users"]', 0);
            }]);
        });
          scored(`El boton /users de la barra de navegación  aparece si el usuario logueado es administrador.`, 0.2, async function(){ 
              await asUser.apply(this, ["admin", async function(user) {
                  await browser.visit("/");
                  browser.assert.elements('[href="/users"]', 1, 1);
              }]);
          });
          scored(`La petición para ver el perfil de un usuario no está permitida si no hay nadie logueado.`, 0.4, async function(){ 
              await asUser.apply(this, [null, async function(user) {
                  try {
                  await browser.visit("/users/1");
                      this.msg_err = "No se redirecciona a la página de login";
                      browser.location.href.includes('/login').should.be.equal(true);
                  } catch(e) {
                      return;
                  }
                  this.msg_err = 'Debería redireccionarse a login o emitir un error 403';
                  browser.location.href.includes('/login').should.be.equal(true);
              }]);
          });
        scored(`La petición para ver el perfil de un usuario no está permitida si el usuario logueado no es un administrador.`, 0.4, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                try {
                    await browser.visit("/users/1");
                    this.msg_err = "Se permite acceder, y no debería";
                }catch(e) {
                    browser.assert.status(403);
                    return;
                }
                throw new Error(this.msg_err);
            }]);
        });
        scored(`La petición para ver el perfil de un usuario está permitida si el usuario logueado es un administrador.`, 0.4, async function(){ 
            await asUser.apply(this, ["admin", async function(user) {
                await browser.visit("/users/1");
                browser.location.href.includes('/login').should.be.equal(false);
            }]);
        });

        scored(`La petición para editar el perfil de un usuario no está permitida si no hay nadie logueado.`, 0.3, async function(){ 
            await asUser.apply(this, [null, async function(user) {
                await browser.visit("/users/1/edit");
                this.msg_err = "No se redirecciona a la página de login";
                browser.location.href.includes('/login').should.be.equal(true);
            }]);
        });
        scored(`La petición para editar el perfil de un usuario no está permitida si el usuario logueado no es un administrador.`, 0.3, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                try {
                    await browser.visit("/users/1/edit");
                    this.msg_err = "Se permite el acceso, pero no debería";
                }catch(e) {
                    browser.assert.status(403);
                    return;
                }
                throw new Error(this.msg_err);
            }]);
        });
        scored(`La petición para editar el perfil de un usuario está permitida si el usuario logueado es un administrador.`, 0.3, async function(){ 
            await asUser.apply(this, ["admin", async function(user) {
                await browser.visit("/users/1/edit");
                browser.assert.status(200);
            }]);
        });
        scored(`La petición para borrar el perfil de un usuario no está permitida si no hay nadie logueado.`, 0.3, async function(){ 
            await asUser.apply(this, [null, async function(user) {
                await browser.visit("/users/1/?_method=DELETE");
                this.msg_err = "No se redirecciona a la página de login";
                browser.location.href.includes('/login').should.be.equal(true);
            }]);
        });
        scored(`La petición para borrar el perfil de un usuario no está permitida si el usuario logueado no es un administrador.`, 0.3, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                try {
                    await browser.visit("/users/1/?_method=DELETE");
                    this.msg_err = "Se permite el acceso, pero no debería";
                }catch(e) {
                    browser.assert.status(403);
                    return;
                }
                throw new Error(this.msg_err);
            }]);
        });
        scored(`La petición para crear un usuario no está permitida si no hay nadie logueado.`, 0.4, async function(){ 
            await asUser.apply(this, [null, async function(user) {
                try {
                    await browser.visit("/users/new");
                    this.msg_err = "Se permite el acceso, pero no debería";
                }catch(e) {
                    browser.assert.status(403);
                    return;
                }
                browser.location.href.includes('/login').should.be.equal(true);
            }]);
        });
        scored(`La petición para crear un usuario no está permitida si el usuario logueado no es un administrador.`, 0.4, async function(){ 
            await asUser.apply(this, ["pepe", async function(user) {
                try {
                    await browser.visit("/users/new");
                    this.msg_err = "Se permite el acceso, pero no debería";
                }catch(e) {
                    browser.assert.status(403);
                    return;
                }
                throw new Error(this.msg_err);
            }]);
        });
        scored(`La petición para crear un usuario está permitida si el usuario logueado es un administrador.`, 0.4, async function(){ 
            await asUser.apply(this, ["admin", async function(user) {
                await browser.visit("/users/new");
                browser.assert.status(200);
            }]);
        });
        scored(`La petición para borrar el perfil de un usuario está permitida si el usuario logueado es un administrador.`, 0.3, async function(){ 
            await asUser.apply(this, ["admin", async function(user) {
                await browser.visit("/users/2/?_method=DELETE");
                browser.assert.status(200);
            }]);
        });
        /*
         */
    });
});
