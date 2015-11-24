var gulp = require('gulp');

var plumber = require('gulp-plumber');
var babel = require('gulp-babel');
var options = {
  presets: ["stage-0", "async-to-bluebird", "es2015-node5"],
  //plugins: ["babel-plugin-syntax-async-generators", "babel-plugin-transform-regenerator"]
  /*plugins: [
    "babel-plugin-syntax-async-generators",
    "babel-plugin-transform-es2015-destructuring",
    "babel-plugin-transform-es2015-modules-commonjs",
    "babel-plugin-transform-es2015-parameters",
    "babel-plugin-transform-es2015-sticky-regex",
    "babel-plugin-transform-es2015-unicode-regex",
    "babel-plugin-transform-es2015-function-name",
    "babel-plugin-transform-do-expressions",
    "babel-plugin-transform-async-for-of",
    "babel-plugin-transform-function-bind",
    "babel-plugin-transform-class-constructor-call",
    "babel-plugin-transform-class-properties",
    "babel-plugin-transform-decorators",
    "babel-plugin-transform-export-extensions",
    "babel-plugin-syntax-trailing-function-commas",
    "babel-plugin-transform-object-rest-spread",
    "babel-plugin-transform-async-to-generator",
    "babel-plugin-transform-exponentiation-operator",
  ],*/
};

var sourcemaps = require('gulp-sourcemaps');

gulp.task('compile', function() {
  return gulp
    .src('src/**/*.js')
    .pipe(plumber({
      errorHandler: function(err) {
        console.error(err.stack);
        this.emit('end');
      }
    }))
    .pipe(sourcemaps.init())
    .pipe(babel(options))
    .pipe(plumber.stop())
    .pipe(sourcemaps.write('maps/'))
    .pipe(gulp.dest('dist/'));
});

gulp.task('watch', function() {
  return gulp.watch('src/**/*.js', ['compile']);
});

gulp.task('default', ['compile']);
