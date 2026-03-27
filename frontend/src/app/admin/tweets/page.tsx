import { getAdminTweets } from "@/actions/admin";
import TweetModerationRow from "@/components/TweetModerationRow";

export default async function AdminTweetsPage() {
  const tweets = await getAdminTweets();

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>Content Moderation</h1>
      <p style={{ marginBottom: '20px', color: '#71767b' }}>Showing most recent 100 tweets.</p>

      <div style={{ border: '1px solid #333639', borderRadius: '8px' }}>
        {tweets.length === 0 ? (
          <p style={{ padding: '20px' }}>No tweets found.</p>
        ) : (
          tweets.map((tweet: any) => (
            <TweetModerationRow key={tweet.id} tweet={tweet} />
          ))
        )}
      </div>
    </div>
  );
}
