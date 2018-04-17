// tslint:disable:no-implicit-dependencies
import webpack from 'webpack';
import slsw from 'serverless-webpack';
import path from 'path';
import UglifyJSPlugin from 'uglifyjs-webpack-plugin';
import { mapValues } from 'lodash';
import { ifProd, isDev } from '@hollowverse/utils/helpers/env';

module.exports = {
  entry: slsw.lib.entries,
  target: 'node',
  devtool: isDev ? 'source-map' : false,
  output: {
    libraryTarget: 'commonjs',
    path: path.resolve(__dirname, 'dist'),
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
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },
  externals: ['aws-sdk'],
  plugins: [
    new webpack.WatchIgnorePlugin([/node_modules/]),
    new webpack.NoEmitOnErrorsPlugin(),
    new webpack.optimize.ModuleConcatenationPlugin(),
    new webpack.optimize.OccurrenceOrderPlugin(true),
    new webpack.optimize.AggressiveMergingPlugin(),
    new webpack.DefinePlugin(
      mapValues(
        {
          'process.env.NODE_ENV': process.env.NODE_ENV,
        },
        v => JSON.stringify(v),
      ),
    ),
    ...ifProd([
      new UglifyJSPlugin({
        parallel: true,
        sourceMap: true,
      }),
    ]),
  ],
};
