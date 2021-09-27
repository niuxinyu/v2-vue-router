const fs = require('fs')
const path = require('path')
const VuePlugin = require('vue-loader/lib/plugin')
const webpack = require('webpack')

console.log(process.env.NODE_ENV);

module.exports = ({vueDist}) => {
  return Object.assign(
    {
      // Expose __dirname to allow automatically setting basename.
      context: __dirname,
      node: {
        __dirname: true
      },

      watch: true,

      mode: process.env.NODE_ENV || 'development',

      // 默认读取所有的 examples
      // entry: fs.readdirSync(__dirname).reduce((entries, dir) => {
      //   const fullDir = path.join(__dirname, dir)
      //   const entry = path.join(fullDir, 'app.js')
      //   if (fs.statSync(fullDir).isDirectory() && fs.existsSync(entry)) {
      //     entries[dir] = ['es6-promise/auto', entry]
      //   }
      //
      //   console.log(entries);
      //
      //   return entries
      // }, {}),

      entry: {
        'debugger': [
          'es6-promise/auto',
          path.resolve(__dirname, './debugger/app.js')
        ]
      },

      output: {
        path: path.join(__dirname, '__build__'),
        filename: '[name].js',
        chunkFilename: '[id].chunk.js',
        publicPath: '/__build__/'
      },

      module: {
        rules: [
          {
            test: /\.js$/,
            exclude: /node_modules/,
            use: 'babel-loader'
          },
          {
            test: /\.vue$/,
            use: 'vue-loader'
          },
          {
            test: /\.css$/,
            use: ['vue-style-loader', 'css-loader']
          }
        ]
      },

      resolve: {
        alias: Object.assign(
          {
            'vue-router': path.join(__dirname, '..', 'dist/vue-router.esm.js')
          },
          vueDist ? {} : {
            vue: 'vue/dist/vue.esm.js',
          }
        )
      },

      // 是否将引入的包单独打包为 chunk
      // 这是最小引用次数为一次就单独打包
      optimization: {
        splitChunks: {
          cacheGroups: {
            shared: {
              name: 'shared',
              chunks: 'initial',
              minChunks: 1
            }
          }
        }
      },

      plugins: [
        new VuePlugin(),
        vueDist ? new webpack.DefinePlugin({
          'process.env.vueDist': true
        }) : void 0
      ]
    },
    vueDist ? {
      externals: {
        'vue': 'Vue',
      }
    } : {}
  )
}
