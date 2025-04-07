import styles from "./page.module.css";
import TransferTable from "../components/TransferTable";

export const metadata = {
  title: 'Pay Dollar Stats',
  description: 'Tracking USDC Transfers to Contract',
  other: {
    'fc:frame': JSON.stringify({
      version: "next",
      imageUrl: "https://images.kasra.codes/pay-dollar-rectangle.png",
      button: {
        title: "MANUAL OVERRIDE",
        action: {
          type: "launch_frame",
          name: "Dollar Payers Override",
          url: process.env.NEXT_PUBLIC_BASE_URL,
          splashImageUrl: "https://images.kasra.codes/pay-dollar-square.png",
          splashBackgroundColor: "#FFFFFF"
        }
      }
    })
  }
};

export default async function Home() {
  // Server component
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.header}>
          <div className={styles.titleContainer}>
            <h1 className={`${styles.title} glitch-text`}>PAY DOLLAR STATS</h1>
            <span className="terminal-cursor"></span>
          </div>
          <div className={styles.subtitle}>
            :: MAINFRAME ACCESS GRANTED :: USDC TRANSFER MONITORING SYSTEM :: <span style={{ opacity: 0.6 }}>v3.4.2</span>
          </div>
        </div>
        <div className={styles.mainContent}>
          <TransferTable />
        </div>
      </main>
    </div>
  );
}
