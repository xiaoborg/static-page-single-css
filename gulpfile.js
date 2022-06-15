//import all plugings
const gulp = require('gulp')
// const babel = require("gulp-babel");
const { series } = require('gulp')
const yargs = require('yargs')
const browserSync = require('browser-sync').create()
const fs = require('fs')
const yaml = require('js-yaml')
const sass = require('gulp-sass')(require('sass'))
const uglify = require('gulp-uglify') //压缩js
const gulpif = require('gulp-if') //支持if
const autoprefixer = require('autoprefixer') //自动完成 css 属性浏览器前缀
const sourcemaps = require('gulp-sourcemaps') //让错误信息友好显示
const postcss = require('gulp-postcss') //让css支持js插件
const named = require('vinyl-named') //保持输出的js文件不变
const webpackStream = require('webpack-stream')
const webpack2 = require('webpack')
const postcssImport = require('postcss-import') //css import
const cssMqpacker = require('css-mqpacker') //把css媒体查询自动合并
const cssnano = require('cssnano') //css压缩
const fileinclude = require('gulp-file-include') // 合并html
const cssmin = require('gulp-cssmin')
const beautify = require('gulp-beautify')
const rename = require('gulp-rename')
const del = require('del')
const header = require('gulp-header')
const moment = require('moment')
const childProcess = require('child_process')
const replace = require('gulp-replace')

// 编译时间
const udpateTime = moment().format('YYYY/MM/DD HH:MM:SS')

// 获取当前分支
const branch = childProcess
  .execSync('git rev-parse --abbrev-ref HEAD')
  .toString()
  .replace(/\s+/, '')
// 获取命令行参数，这里主要用来判断是开发状态还是产品状态
let PRODUCTION = !!yargs.argv.production
const currentVersion = PRODUCTION ? process.env.npm_config_currentVersion : ''
// Load settings from config.yml
const YmlConfig = loadConfig()
showConsole('*', 'currentEnv', PRODUCTION ? 'production' : 'devlopment')
showConsole('*', 'currentVersion', currentVersion)
showConsole('*', 'StartTime', udpateTime)

//加载配置文件
function loadConfig() {
  let ymlFile = fs.readFileSync('config.yml', 'utf8')
  return yaml.load(ymlFile)
}

// html -> dist
function pages() {
  return (
    gulp
      .src('src/pages/**/*.{html,hbs,handlebars}')
      // .pipe(gulp.dest(PATHS.dist + '/pages'));
      .pipe(fileinclude())
      .pipe(beautify.html({ indent_size: 2 }))
      .pipe(gulp.dest(YmlConfig.PATHS.dist))
  )
}
// 将dist中html 变量替换
function pagesDist() {
  return gulp
    .src(YmlConfig.PATHS.html.replace)
    .pipe(
      replace(
        '@currentEnvironment',
        PRODUCTION && branch === 'master' ? 'production' : 'develop'
      )
    )
    .pipe(beautify.html({ indent_size: 2 }))
    .pipe(gulp.dest(YmlConfig.PATHS.dist))
}

// Copy files out of the assets folder
// This task skips over the "img", "js", and "scss" folders, which are parsed separately
function copy() {
  return gulp
    .src(YmlConfig.PATHS.assets)
    .pipe(gulp.dest(YmlConfig.PATHS.dist + '/assets'))
}

// 启动本地服务器和浏览器
function server(done) {
  browserSync.init(
    {
      server: './dist',
      port: YmlConfig.PORT
    },
    done
  )
}

//通过webpack进行javascript的模块打包
let webpackConfig = {
  mode: PRODUCTION ? 'production' : 'development',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            compact: false
          }
        }
      }
    ]
  },
  output: {
    filename: '[name].js'
  },
  devtool: !PRODUCTION && 'source-map'
}

// Javascript
function js() {
  return (
    gulp
      .src(YmlConfig.PATHS.js.entries)
      .pipe(named())
      .pipe(sourcemaps.init())
      .pipe(webpackStream(webpackConfig, webpack2))
      //在build的状态才会进行js压缩
      .pipe(
        gulpif(
          PRODUCTION && branch === 'master',
          uglify().on('error', e => {
            console.log(e)
          })
        )
      )
      .pipe(gulpif(!(PRODUCTION && branch === 'master'), sourcemaps.write()))
      .pipe(header('/*' + udpateTime + '*/\n'))

      .pipe(
        gulp.dest(
          PRODUCTION && branch === 'master'
            ? YmlConfig.PATHS.js.dist.production
            : YmlConfig.PATHS.js.dist.develop
        )
      )
  )
}

//sass
function css() {
  const postCssPlugins = [
    autoprefixer({ overrideBrowserslist: YmlConfig.COMPATIBILITY }),
    PRODUCTION && branch === 'master' ? postcssImport : '',
    PRODUCTION && branch === 'master' ? cssMqpacker : cssMqpacker,
    PRODUCTION && branch === 'master' ? cssnano : ''
  ].filter(Boolean)
  if (PRODUCTION && branch === 'master') {
    return (
      gulp
        // .src(cssPath[0].src)
        // .src(YmlConfig.PATHS.css.entries)
        .src(YmlConfig.PATHS.css.entries)
        .pipe(sourcemaps.init())
        .pipe(sass().on('error', sass.logError))
        .pipe(postcss(postCssPlugins))
        .pipe(cssmin())
        .pipe(sourcemaps.write())
        .pipe(header('/*' + udpateTime + '*/\n'))
        .pipe(gulp.dest(YmlConfig.PATHS.css.dist.production))
        .pipe(browserSync.reload({ stream: true }))
    )
  } else {
    return gulp
      .src(YmlConfig.PATHS.css.entries)
      .pipe(sourcemaps.init())
      .pipe(sass().on('error', sass.logError))
      .pipe(postcss(postCssPlugins))
      .pipe(sourcemaps.write())
      .pipe(header('/*' + udpateTime + '*/'))
      .pipe(gulp.dest(YmlConfig.PATHS.css.dist.develop))
      .pipe(browserSync.reload({ stream: true }))
  }
}

// Copy images to the "dist" folder
function images() {
  return gulp
    .src(YmlConfig.PATHS.img.dev)
    .pipe(gulp.dest(YmlConfig.PATHS.img.pro))
}

async function cleanDist() {
  del.sync(['dist'])
}

// watch
function watch() {
  // gulp.watch(PATHS.assets, copy);
  gulp
    .watch(YmlConfig.PATHS.watch.html)
    .on('all', gulp.series(pages, pagesDist, browserSync.reload))
  gulp
    .watch(YmlConfig.PATHS.watch.css)
    .on('all', gulp.series(css, browserSync.reload))
  gulp
    .watch(YmlConfig.PATHS.watch.js)
    .on('all', gulp.series(js, browserSync.reload))
  gulp
    .watch(YmlConfig.PATHS.watch.img)
    .on('all', gulp.series(images, browserSync.reload))
}

function showConsole(_symbol, dsc, val) {
  var logSymsbol = ''
  for (let i = 0; i < 20; i++) {
    logSymsbol = logSymsbol + _symbol
  }
  console.log(logSymsbol)
  console.log(dsc + ':' + val)
  console.log(logSymsbol)
}
exports.pagesDist = series(pagesDist)
exports.copy = series(copy)
exports.images = series(images)
exports.css = series(css)
exports.server = series(server)
exports.cleanDist = series(cleanDist)
exports.default = series(images, css, js, pages, pagesDist, server, watch)
// exports.default = series(css, js, pages, pagesDist, server, watch);
exports.build = series(cleanDist, copy, images, css, js, pages, pagesDist)
// exports.build = series(cleanDist, css, js, pages, pagesDist);
