/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */

const webpack = require('webpack');
const path = require('path');
const { isProd } = require('./env');

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: {
    assignEnvironment: [path.join(__dirname, 'src', 'assignEnvironment.ts')],
  },
  target: 'node',
  devtool: 'source-map',
  output: {
    libraryTarget: 'commonjs',
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  stats: 'minimal',
  module: {
    rules: [
      {
        test: /\.ts$/i,
        use: [
          {
            loader: 'babel-loader',
          },
          {
            loader: 'ts-loader',
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new webpack.WatchIgnorePlugin([/node_modules/]),
    new webpack.optimize.AggressiveMergingPlugin(),
  ],
};
