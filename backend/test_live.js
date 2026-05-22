import axios from 'axios';

async function test() {
  const apiKey = 'd1ed51df92msh96d500c4a51d6ccp10744djsnf5cdfa260f99';
  try {
    const response = await axios.get('https://cricket-live-line1.p.rapidapi.com/liveMatches', {
      headers: {
        'x-rapidapi-host': 'cricket-live-line1.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    console.log("Success! Data:");
    console.log(JSON.stringify(response.data, null, 2).substring(0, 1500));
  } catch (err) {
    console.error("Error:");
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error("Headers:", err.response.headers);
      console.error("Data:", err.response.data);
    } else {
      console.error(err.message);
    }
  }
}

test();
