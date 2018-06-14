// tslint:disable:no-implicit-dependencies
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
import webpack from 'webpack';
import slsw from 'serverless-webpack';
import path from 'path';
import { isProd } from '@hollowverse/utils/helpers/env';

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: slsw.lib.entries,
  target: 'node',
  devtool: 'source-map',
  output: {
    libraryTarget: 'commonjs',
    path: path.resolve(__dirname, '.webpack'),
    filename: '[name].js',
  },
  stats: 'minimal',
  module: {
    rules: [
      {
        test: /\.jsx?$/i,
        exclude: /node_modules/i,
        use: [
          {
            loader: 'babel-loader',
          },
        ],
      },
      {
        test: /\.tsx?$/i,
        exclude: /node_modules/i,
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
  plugins: [new webpack.WatchIgnorePlugin([/node_modules/])],
  externals: ['aws-sdk'],
};
