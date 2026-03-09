import React from 'react';
import { AppProps } from 'next/app';
import PhotoBender from '../components/PhotoBender';

const MyApp = ({ Component, pageProps }: AppProps) => {
  return <Component {...pageProps} />;
};

export default MyApp;

// create a new file: pages/index.js

// index.js
import React from 'react';
import PhotoBender from '../components/PhotoBender';

const HomePage = () => {
  return <PhotoBender />;
};

export default HomePage;