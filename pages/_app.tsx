import App, { AppContext, AppInitialProps, AppProps } from "next/app";

import "./styles.css";

type AppOwnProps = { example: string };

export default function MyApp({
  Component,
  pageProps,
  example,
}: AppProps & AppOwnProps) {
  return (
    <>
      <p>Data: {example}</p>
      <Component {...pageProps} />
    </>
  );
}
