"use strict";

const mongodb = require('mongodb');
// Standard URI format: mongodb://[dbuser:dbpassword@]host:port/dbname, details set in .env
const MONGODB_URI = 'mongodb://'+process.env.USER+':'+process.env.PASS+'@'+process.env.HOST+':'+process.env.DB_PORT+'/'+process.env.DB;

let all_collections, connected = false;

function connect_for_request( collection_name ) 
  { return new Promise( function( resolve, reject ) 
    { if( !connected ) 
        try 
        { mongodb.MongoClient.connect(MONGODB_URI, { poolSize: 10 }, function(err, db) 
          { if(err) reject(err);

            db.listCollections({}).toArray( (err, collections) => 
            { if(err) reject(err);
              all_collections = {};
              collections.forEach( c => {
                  all_collections[ c.name ] = new Collection_Manager( db.collection( c.name ) );
              });
              resolve( all_collections[ collection_name ] );
            })
          });
          connected = true;
        } catch(ex) { reject(new DatastoreUnknownException("connect", null, ex)); }

      else 
      { resolve( all_collections[ collection_name ] );
      }
    });
}


class Collection_Manager
{ constructor( c ) { this.collection = c; }
  set(key, value) {
    return new Promise( (resolve, reject) => {
      if (typeof(key) !== "string") {
        reject(new DatastoreKeyNeedToBeStringException(key));
      } else {
        try {
          var serializedValue = JSON.stringify(value);
          this.collection.updateOne({"key": key}, {$set: {"value": serializedValue}}, {upsert:true}, function (err, res) {
            if (err) {
              reject(new DatastoreUnderlyingException(value, err));
            } else {
              resolve(res);
            }
          });
        } catch (ex) {
          reject(new DatastoreValueSerializationException(value, ex));
        }
      }
    });
  }
 get(key) {
    return new Promise( (resolve, reject) => {
      try {
        if (typeof(key) !== "string") {
          reject(new DatastoreKeyNeedToBeStringException(key));
        } else {
          this.collection.findOne({"key":key}, function (err, data) {
            if (err) {
              reject(new DatastoreUnderlyingException(key, err));
            } else {
              try {
                if(data===null){
                  resolve(null);
                }
                else{
                  resolve(JSON.parse(data.value));
                }
              } catch (ex) {
                reject(new DatastoreDataParsingException(data.value, ex));
              }
            }
          });
        }
      } catch (ex) {
        reject(new DatastoreUnknownException("get", {"key": key}, ex));
      }
    });
  }
};

function DatastoreKeyNeedToBeStringException(keyObject) {
  this.type = this.constructor.name;
  this.description = "Datastore can only use strings as keys, got " + keyObject.constructor.name + " instead.";
  this.key = keyObject;
}

function DatastoreValueSerializationException(value, ex) {
  this.type = this.constructor.name;
  this.description = "Failed to serialize the value to JSON";
  this.value = value;
  this.error = ex;
}

function DatastoreDataParsingException(data, ex) {
  this.type = this.constructor.name;
  this.description = "Failed to deserialize object from JSON";
  this.data = data;
  this.error = ex;
}

function DatastoreUnderlyingException(params, ex) {
  this.type = this.constructor.name;
  this.description = "The underlying DynamoDB instance returned an error";
  this.params = params;
  this.error = ex;
}

function DatastoreUnknownException(method, args, ex) {
  this.type = this.constructor.name;
  this.description = "An unknown error happened during the operation " + method;
  this.method = method;
  this.args = args;
  this.error = ex;
}

var asyncDatastore = {
  connect_for_request
};

module.exports = {
  async: asyncDatastore
};