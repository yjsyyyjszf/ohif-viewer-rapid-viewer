/**
 * Webpack config for production electron main process
 */

const path = require('path');
const webpack = require('webpack');
const merge = require('webpack-merge');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const baseConfig = require('./webpack.config.base');
// const TerserJSPlugin = require('terser-webpack-plugin');

module.exports = merge(baseConfig, {
  devtool: process.env.DEBUG_PROD === 'true' ? 'source-map' : 'none',

  mode: 'production',

  target: 'electron-main',

  entry: './main/index.dev.js',

  output: {
    path: path.join(__dirname, '..'),
    filename: './main/index.prod.js',
  },

  // optimization: {
  //   minimizer: process.env.E2E_BUILD
  //     ? []
  //     : [
  //         new TerserPlugin({
  //           parallel: true,
  //           sourceMap: true,
  //           cache: true,
  //         }),
  //       ],
  // },
  optimization: {
    minimize: false,
  },

  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode:
        process.env.OPEN_ANALYZER === 'true' ? 'server' : 'disabled',
      openAnalyzer: process.env.OPEN_ANALYZER === 'true',
    }),

    /**
     * Create global constants which can be configured at compile time.
     *
     * Useful for allowing different behaviour between development builds and
     * release builds
     *
     * NODE_ENV should be production so that modules do not perform certain
     * development checks
     */
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'production',
      DEBUG_PROD: false,
      START_MINIMIZED: false,
      E2E_BUILD: false,
    }),
  ],

  /**
   * Disables webpack processing of __dirname and __filename.
   * If you run the bundle in node.js it falls back to these values of node.js.
   * https://github.com/webpack/webpack/issues/2010
   */
  node: {
    __dirname: false,
    __filename: false,
  },
});
