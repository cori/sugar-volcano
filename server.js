const assets = require( "./assets" ),
     express = require( "express" ),
   datastore = require( "./datastore" ).async,
 body_parser = require( 'body-parser' ),
         app = express();

const listed_articles = [ "Tutorial_Animation", "Surfaces_Demo", "Star", "Springs_Demo", "Out_Of_Body_Demo", "Text_Demo", "Many_Light_Demo", "Bump_Map_Demo_And_Mesh_Loader", "Inertia_Demo", "Collision_Demo", "Ray_Tracer", "Visual_Billiards", "Bases_Game" ];

app.use( body_parser.urlencoded( { extended: false } ) );
app.use( body_parser.json() );
app.use( "/assets", assets );

require( 'nunjucks' ).configure('views', { autoescape: false, express: app } ); // setup nunjucks for templating in views/index.html

app.listen( 3000, () => console.log( 'Listening on port 3000' ) );

function extract_classnames_from_URL( input, result = [] )  // (See stackoverflow on "How to pass a parameter to a
  {                                                         // javascript through a url and display it on a page?"
    if( input.length ) for ( let q of input.split("&") )         
      result.push( decodeURIComponent( q || "" ).replace(/[^_\-\d]+/g, (s) => s.charAt(0).toUpperCase() + s.substr(1).toLowerCase() )
                                                .replace(/-/g,"_") ); 
    return result;
  }


function extract_classnames_from_JS_URL( input, start = input.indexOf('?'), result = [] )  // (See stackoverflow on "How to pass a parameter to a
  { if( start == -1 ) return [];                                                        // javascript through a url and display it on a page?"
    if( input.length ) for ( let q of input.substring( start+1 ).split("&") )         
      result.push( decodeURIComponent( q || "" ).replace(/[^_\d]+/g, (s) => s.charAt(0).toUpperCase() + s.substr(1).toLowerCase() )
                                                .replace(/-/g,"_") ); 
    return result;
  }

class Code_Manager
  { constructor( code )
    { const es6_tokens_parser = RegExp( [ 
        /((['"])(?:(?!\2|\\).|\\(?:\r\n|[\s\S]))*(\2)?|`(?:[^`\\$]|\\[\s\S]|\$(?!\{)|\$\{(?:[^{}]|\{[^}]*\}?)*\}?)*(`)?)/,    // Any string.
        /(\/\/.*)|(\/\*(?:[^*]|\*(?!\/))*(\*\/)?)/,                                                                           // Any comment (2 forms).  And next, any regex:
        /(\/(?!\*)(?:\[(?:(?![\]\\]).|\\.)*\]|(?![\/\]\\]).|\\.)+\/(?:(?!\s*(?:\b|[\u0080-\uFFFF$\\'"~({]|[+\-!](?!=)|\.?\d))|[gmiyu]{1,5}\b(?![\u0080-\uFFFF$\\]|\s*(?:[+\-*%&|^<>!=?({]|\/(?![\/*])))))/,
        /(0[xX][\da-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/,                                     // Any number.
        /((?!\d)(?:(?!\s)[$\w\u0080-\uFFFF]|\\u[\da-fA-F]{4}|\\u\{[\da-fA-F]+\})+)/,                                          // Any name.
        /(--|\+\+|&&|\|\||=>|\.{3}|(?:[+\-\/%&|^]|\*{1,2}|<{1,2}|>{1,3}|!=?|={1,2})=?|[?~.,:;[\](){}])/,                      // Any punctuator.
        /(\s+)|(^$|[\s\S])/                                                                                                   // Any whitespace. Lastly, blank/invalid.
          ].map( r => r.source ).join('|'), 'g' );

      this.tokens = [];    this.no_comments = [];    let single_token = null;
      while( ( single_token = es6_tokens_parser.exec( code ) ) !== null )
      { let token = { type: "invalid", value: single_token[0] }
             if ( single_token[  1 ] ) token.type = "string" , token.closed = !!( single_token[3] || single_token[4] )
        else if ( single_token[  5 ] ) token.type = "comment"
        else if ( single_token[  6 ] ) token.type = "comment", token.closed = !!single_token[7]
        else if ( single_token[  8 ] ) token.type = "regex"
        else if ( single_token[  9 ] ) token.type = "number"
        else if ( single_token[ 10 ] ) token.type = "name"
        else if ( single_token[ 11 ] ) token.type = "punctuator"
        else if ( single_token[ 12 ] ) token.type = "whitespace"        
        this.tokens.push( token )
        if( token.type != "whitespace" && token.type != "comment" ) this.no_comments.push( token.value );
      }  
    }
  }

//var connectOnProjectCreation = datastore.initial_connect.bind( undefined, process.env.COLLECTION );

function render_final_code( state )
{ let { response, names, core_official, requested_demo, included_demos, open_list, closed_list, dependencies, notfound } = state;
  closed_list = closed_list.filter( dep => names[ dep ].category != "Core" );  // Leave Core classes out, as they'll be in tiny-graphics.js already.

  const finish = ( response, text ) =>
  { response.setHeader('content-type', 'text/javascript');
    response.write( text );
    response.end();
  }
  
  if( notfound ) 
    finish( response, "// Some dependencies were not found in the database; Generation of dependencies.js gave up." );
  
  const get_container = ( class_name ) => names[ class_name ].category == "Core" ? "tiny_graphics" : "classes";
  
  let final_code = [ ...closed_list, ...included_demos ]
                     .map( d => "window." + d + " = window." + get_container(d) + "." + d + " = \n" + dependencies[ d ].code )
                     .join( "\n\n" );       
  finish( response, final_code );
}
  
function pull_more_dependencies( resolve, collection, state )     // Recursively perform tree traversal through database, then render page if done
{ let { response, names, core_official, requested_demo, included_demos, curr, open_list, closed_list, dependencies } = state;  
  let depname;
  do  { if( !curr.length ) { resolve( state ); return; }    // All dependencies we need are sorted into state now.  Render the result.
        if( !names[curr] ) { resolve( Object.assign( state, { notfound: 1 } ) ); return; }    // Give up and render empty dependencies.js if a dependency doesn't exist.

        depname = dependencies[ curr ].dependencies[ state.dep_idx++ ];        // Examine curr's next dependency, or if none, move forward in open list to next curr
        if( typeof( depname ) === "undefined" ) { state.dep_idx = 0; curr = state.curr = open_list.splice(-1); }        
      } while( typeof( depname ) === "undefined" )

  if( !closed_list.includes( depname ) )    
    { open_list.push( depname );
      console.log( closed_list + ", ### " + dependencies );
      const insertion_point = closed_list.findIndex( x => dependencies[ x ].superclass === depname );
      closed_list.splice( insertion_point, 0, depname );     // Insert curr into closed list before the first item with it as a superclass, or at the end if none.
      if( [ "Official", "Core" ].includes( names[ depname ].category ) )
        { dependencies[ depname ] = core_official[ depname ];        
          pull_more_dependencies( resolve, collection, state );
        }
      else collection.get( depname ).then( function( dep ) 
        { dependencies[ depname ] = dep;
          pull_more_dependencies( resolve, collection, state );
        } );
    }
  else pull_more_dependencies( resolve, collection, state );
}


// TODO:  Any way to use Promise.all() shorter than the chained thens?

app.get("/dependencies.js", function (request, response)
{ try { datastore.connect_for_request("F18_174a").then( function( collection ) 
    { collection.get("names").then( function( names ) { collection.get("core_official_classes").then( function( core_official )          
      { let included_demos = extract_classnames_from_JS_URL( request.originalUrl.substring(1) );       
        if( !included_demos.length ) included_demos.push( "Minimal_Webgl_Demo" );    // Default demo
        let requested_demo = included_demos.shift();    // Count the first demo in the list as the featured one
        
        let state = { response, names, core_official, requested_demo, included_demos, curr: requested_demo, dep_idx: 0, open_list: [...included_demos], closed_list: [], dependencies: {} };
        if( !core_official ) { render_final_code( Object.assign( state, { notfound: 1 } ) ); return; }
        
        let pull_initial_dependencies = ( list ) =>
        { if( !list.length ) { ( new Promise( (resolve) => { pull_more_dependencies( resolve, collection, state ); }) ).then( function() { render_final_code( state ) } ); return; }
          let dep_name = list.shift();
          if( !names || !names[dep_name] ) { render_final_code( Object.assign( state, { notfound: 1 } ) ); return; }    // Give up and render empty dependencies.js if index.html's main feature doesn't exist.
          if( [ "Official", "Core" ].includes( names[ dep_name ].category ) )
            { state.dependencies[ dep_name ] = core_official[ dep_name ];
              pull_initial_dependencies( list );
            }
          else collection.get( dep_name ).then( function( dep_obj ) 
            { state.dependencies[ dep_name ] = dep_obj;
              pull_initial_dependencies( list );
            } );          
        }
        pull_initial_dependencies( [ requested_demo, ...included_demos ] );
  }) }) }) } catch (err) { console.log("app.get error: " + err);  response.status(500);  response.end();  }
});
  
app.get("/main-scene.js", function (request, response)
{ try { datastore.connect_for_request("F18_174a").then( function( collection )
    { collection.get("names").then( function( names ) {
      { let included_demos = extract_classnames_from_JS_URL( request.originalUrl.substring(1) );
        if( !included_demos.length ) included_demos.push( "Minimal_Webgl_Demo" );    // Default demo
        let requested_demo = included_demos.shift();    // Count the first demo in the list as the featured one
        
        response.setHeader('content-type', 'text/javascript');
        if( !names || !names[ "Minimal_Webgl_Demo"] ) { response.write( "// Minimal_Webgl_Demo not defined." ); response.end(); return }    // Give up and render blank featured-scene.js if there's no database.
        if( !names || !names[ requested_demo ] || names[ requested_demo ].base_class != "Scene_Component" ) requested_demo = "Minimal_Webgl_Demo";  // IF request invalid, use default.   
              
        const first_line = "window." + requested_demo + " = window.classes." + requested_demo + " = \n";
        if( [ "Official", "Core" ].includes( names[ requested_demo ].category ) )
          collection.get("core_official_classes").then( function( core_official      ) 
          { response.write( first_line + core_official[ requested_demo ].code ); 
            response.end(); 
          } );
        else collection.get( requested_demo     ).then( function( requested_demo_obj ) 
          { response.write( first_line + requested_demo_obj.code ); 
            response.end();
          } );
      } 
  }) }) } catch (err) { console.log("app.get error: " + err);  response.status(500);  response.end();  }
});




function save_demo_step( state )
{ let { request, response, collection, existing_object, tokens, class_name, superclass, category, url, names, core_official, json } = state;
  return new Promise( (resolve) =>
    { let dependencies = new Set();
      for( let t of tokens ) if( t != class_name && names.hasOwnProperty( t ) ) dependencies.add( t );  // Extract dependencies       
      const dependencies_string = Array.from( dependencies ).join(' ');

      names[ class_name ] = { category };
      if( [ "Shape", "Shader", "Scene_Component" ].includes(superclass) ) names[ class_name ].base_class = superclass;
      else names[ class_name ].base_class = names[ superclass ] ? names[ superclass ].base_class : superclass;
        
      const password = ( existing_object && existing_object.password ) || ( request.body.finished == "on" ? Math.random().toString(36).slice(-5) : undefined );
      // if( existing_object && existing_object.password ) json.hide_finished_checkbox = "true";
     
      const is_scene = names[ class_name ].base_class == "Scene_Component";
      json.message = ( json.was_existing ? "Your " : "Your new " )
                   + ( is_scene ? "demo " : "helper class " )
                   +   class_name + " with dependencies list [" + dependencies_string + "] is "
                   + ( json.was_existing ? "updated.  " : "submitted.  " )
                   + ( is_scene ? "  It can be accessed at the URL: " + url : "Since it does not inherit from Scene_Component, it is a background class and has no url." )
                   + ( ( password && !json.password_existing ) ? "  WRITE DOWN THIS PASSWORD FOR IT: " + password + " (This will not appear again!!)  Until your class is approved, you can keep modifying it password-free." : "" );     
     
      collection.set("names", names ).then( function() 
      { let object_to_save = { category, superclass, base_class: names[ class_name ].base_class, dependencies: Array.from( dependencies ), 
                               code: request.body.new_demo_code, timestamp: new Date().toLocaleString('en-US'), author: request.body.author, password };
        
        const save_core_offical = function( core_official )
        { core_official[ class_name ] = object_to_save;
          collection.set("core_official_classes", core_official )
            .then( function()
              { response.send( JSON.stringify( json ) );
                return;
              })
        }
        
        if( [ "Core", "Official" ].includes( category ) )         
          if( !core_official ) collection.get("core_official_classes").then( function( core_official ) { save_core_offical( core_official || {} ); } );
          else save_core_offical( core_official );
        else collection.set( class_name, object_to_save )
          .then( function()
            { response.send( JSON.stringify( json ) );
              return;
            })
    }); 
  });  
}

function check_existing_demo_step( state )
{ let { request, response, existing_object, tokens, class_name, superclass, category, url, names } = state;
  return new Promise( (resolve) => 
    { if( existing_object.author && existing_object.author != request.body.author )
        { response.send(  JSON.stringify( { message : "The name "+class_name+" was already taken - only the same author can overwrite it.  Name your class something else, or use that author\'s creditionals."} ) ); return; }
      else if( request.body.overwrite != "on" )
        { response.send(  JSON.stringify( { message : "The name "+class_name+" already exists; overwrite it?", show_overwrite: true } ) ); return; }
      else if( category == "unapproved")
        { state.json = { was_existing: true };
          resolve( state );                      // Continue with saving demo
        }
      else if( existing_object.password && !(request.body.password && request.body.password.length) )
        { response.send( JSON.stringify( { message : "The password is required from when you sumbitted demo.  Please enter it:", show_password: true } ) ); return; }
      else if( existing_object.password == request.body.password )
        { state.json = { was_existing: true, password_existing: true };
          resolve( state );                      // Continue with saving demo
        }
      else
        { response.send( JSON.stringify( { message : "Incorrect password, sorry.  Try again.", show_password: true } ) ); return; }
    } );
  
}

app.post("/submit-demo", function (request, response) 
{ try { datastore.connect_for_request("F18_174a").then( function( collection ) { collection.get("names").then( function( names )           
      { const tokens = new Code_Manager( request.body.new_demo_code ).no_comments;
        if( tokens.length < 5 )
          { response.send( JSON.stringify( { message : "Entry must be a non empty class.  Nothing saved yet." } ) ); return; }
        if( tokens[0] != "class" || tokens[2] == "extends" && tokens[4] != "{" )
          { response.send( JSON.stringify( { message : "Your code must be contained inside a typical class declaration (not a class expression, and no extending of expressions).  Nothing saved yet." } ) ); return; }        
        
        const class_name = tokens[1].replace( /[^_\d]+/g, (s) => s.charAt(0).toUpperCase() + s.substr(1).toLowerCase() ),
              superclass = tokens[2] == "extends" ? tokens[3] : "Object",
                category = extract_classnames_from_JS_URL( request.originalUrl )[0],
                     url = "https://encyclopediaofcode.glitch.me/" + encodeURIComponent( class_name );
        request.body.new_demo_code = request.body.new_demo_code.replace( new RegExp( tokens[1], "g" ), class_name );
        tokens[1] = class_name;
       
        if( !names ) names = {};
        if(  names[ class_name ]  )
          if( [ "Core", "Official" ].includes( names[ class_name ].category )  )
            collection.get("core_official_classes").then( function( core_official )   
              { check_existing_demo_step( { request, response, collection, existing_object: core_official[ class_name ], tokens, class_name, superclass, category, url, names, core_official } )
                  .then( save_demo_step );
              } );
          else
            collection.get( class_name ).then( function( existing_object )   
              { check_existing_demo_step( { request, response, collection, existing_object,                              tokens, class_name, superclass, category, url, names } )
                  .then( save_demo_step );
              } );
        else          // The name was not in use:
          save_demo_step( { request, response, collection, tokens, class_name, superclass, category, url, names, json: {} } );
      }) })
  } catch (err)
  { console.log("app.get error: " + err);
    response.status(500);    response.end();
  }
});




app.get("/recall_object", function (request, response) 
{ try { datastore.connect_for_request("world").then( function( collection ) {
    collection.get( request.originalUrl.substring(15)  ).then( function( world ) {                            // Allow one document request at a time for now
       response.send( world );
    }) })
    } catch (err)
    { console.log("recall_object error: " + err);
      response.status(500);    response.end();
    }
});


app.post("/save_object", function (request, response) 
{ try { datastore.connect_for_request("world").then( function( collection ) { 
      const destination = request.headers.referer.match(/([^\/]*)\/*$/)[1];
      collection.set( destination, request.body )
        .then( function()
          { response.send( request.body );
          }) })
    } catch (err)
    { console.log("save_object error: " + err);
      response.status(500);    response.end();
    }
});


app.use( express.static('public') );

app.get("/*", function (request, response)
{ if( request.originalUrl.includes('.') )
  { console.log( "Request was terminated for " + request.originalUrl );
    response.sendStatus(200); // skip everything if a specific file was requested.
    return;
  }
  try { datastore.connect_for_request("F18_174a").then( function( collection )
    { collection.get("names").then( function( names ) { collection.get("core_official_classes").then( function( core_official )          
      { let included_demos = extract_classnames_from_URL( request.originalUrl.substring(1) );  
        if( !included_demos.length ) included_demos.push( "Minimal_Webgl_Demo" );    // Default demo
        let requested_demo = included_demos.shift();    // Count the first demo in the list as the featured one
         
        if( !names || !names[ "Minimal_Webgl_Demo"] ) { response.render('index.html', { requested_demo: "Blank" } ); return }    // Give up and render the blank page if there's no database.
        if( !names || !names[ requested_demo ] || names[ requested_demo ].base_class != "Scene_Component" ) requested_demo = "Minimal_Webgl_Demo";  // IF request invalid, use default.   
            
        if( [ "Official", "Core" ].includes( names[ requested_demo ].category ) )
          response.render('index.html', { requested_demo,
                                          requested_demos: JSON.stringify( [ requested_demo, ...included_demos ] ),
                                          listed_articles: JSON.stringify( listed_articles ),                                         
                                          requested_demo_code: core_official && core_official[requested_demo] && core_official[requested_demo].code, 
                                          included_demos_string: "?" + [ requested_demo, ...included_demos ].join('&') } );
        else collection.get( requested_demo ).then( function( requested_demo_obj ) {
          response.render('index.html', { requested_demo,
                                          requested_demos: JSON.stringify( [ requested_demo, ...included_demos ] ),
                                          listed_articles: JSON.stringify( listed_articles ),
                                          requested_demo_code: requested_demo_obj && requested_demo_obj.code, 
                                          included_demos_string: "?" + [ requested_demo, ...included_demos ].join('&') } );
          } );
    }) }) }) } catch (err)
  { console.log("app.get error: " + err);
    response.status(500);    response.send( "<pre>" + JSON.stringify(err, null, 2) + "</pre>" );
  }
});