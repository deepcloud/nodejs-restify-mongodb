var mongoose = require('mongoose')
  , User = mongoose.model('User')
  , VerifyCode = mongoose.model('VerifyCode')
  , restify = require('restify')
  , clientSessions = require("client-sessions");

module.exports = function (app, config, auth) {
  /**
   * Return a list of available Roles
   * Must match what's defined in the User.js object
   *
   * Used to restrict access to APIs based on Role for authenticated users
   *
   * User vs. Subscriber: Conceptually used for a free versus paying customer
   *
   * @param request
   * @param response
   * @param next method
   */
   function roles(req, res, next) {
      res.send(['User', 'Subscriber','Admin']);
   }

  /**
   * User logs in using username
   * if new email is blank and email not validated, user cannot login
   *
   * @param request
   * @param response
   * @param next method
   */
   function login(req, res, next) {
      var query = User.where( 'username', new RegExp('^'+req.params.username+'$', 'i') );
      query.findOne(function (err, user) {
         if (err) {
            res.send(err);
           return next();
         } else if (!user) {
            return next(new restify.NotAuthorizedError("Invalid username."));
           return next();
         } else if (user.authenticate(req.params.password)) {
          if (!user.emailValidatedFlag && !user.newEmail) {
             // user account has never been validated
             return next(new restify.NotAuthorizedError("Email address must be validated to activate your account."));
           } else {
             req.session.user = user._id; //subscriber@subscriber
			       res.send(user);
             return next();
           }
         } else {
			      return next(new restify.NotAuthorizedError("Invalid password."));
         }

      });
   }

  /**
   * User logs out
   *
   * @param request
   * @param response
   * @param next method
   */
   function logout(req, res, next) {
      req.session.reset();
      res.send({});
   }


   var VERIFY_EMAIL_SUCCESS = "Your email has been successfully validated.";
   var VERIFY_ACCTL_SUCCESS = "Your account has been successfully validated.";
   var VERIFY_FAIL = "Sorry. We can not validate this account/email. Please try requesting a new code.";


  /**
   * Request includes a verification code to authenticate an email address
   *
   * @param request
   * @param response
   * @param next method
   */
   function verifyCode(req, res, next) {
     var query = VerifyCode.where( 'key', new RegExp('^'+req.params.v+'$', 'i') );
      query.findOne(function (err, verifyCode) {
        if (!err && verifyCode) {
          updateUserEmailStatus(req, res, next, verifyCode);
        } else {
          return next(new restify.NotAuthorizedError(VERIFY_FAIL));
        }
      });
   }

  /**
   * Helper method that updates the database
   *
   * @param request
   * @param response
   * @param next method
   * @param next{Object} instance of VerifyCode
   */
   function updateUserEmailStatus(req, res, next, verifyCode) {
      User.findById(verifyCode.userObjectId, function (err, user) {
      var successMsg = VERIFY_ACCTL_SUCCESS;
        if (!err && user) {
          if (user.newEmail) {
            user.email = user.newEmail;
            user.newEmail = '';
            user.emailValidatedFlag = true;
            successMsg = VERIFY_EMAIL_SUCCESS;
          }
          user.emailValidatedFlag = true;
          user.save(function (err) {
            if (err) {
              if (err.message) {
                return next(new restify.InternalError(err.message));
              } else {
                return next(new restify.InternalError(err));
              }
            } else {
              // clean up all verification codes
              VerifyCode.remove({userObjectId: user._id}, function(err){});

              res.send(successMsg);
              return next();
            }
          });
        } else {
          return next(new restify.NotAuthorizedError(VERIFY_FAIL));
        }
      });
   }

   // Set up routes

   // Ping but with user authentication
   app.get('/api/auth', auth.requiresLogin, function (req, res) {
      res.send({'message':'Success'});
   });

   // Login
   app.post('/api/v1/session/login', login);
   // Logout
   app.get('/api/v1/session/logout', logout);

   // Get the available roles
   app.get('/api/v1/roles', roles);

   // Get the verify a code a link
   app.get('/api/v1/verify', verifyCode);

  // Check user access
   app.get('/api/v1/roles/access', auth.access, function (req, res) {
      res.send({'message':'Success'});
   });
}
