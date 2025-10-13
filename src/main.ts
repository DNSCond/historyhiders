import { Devvit, JobContext, TriggerContext } from "@devvit/public-api";
import { jsonEncodeIndent } from "anthelpers";
import { today } from "./helpers.js";

Devvit.configure({ redditAPI: true, redis: true });

type AuthorData = {
  lastCheck: Date,
  isHiding: boolean,
  isCalculating: boolean,
};

const currentlyTesting = true;
const OneDayInSeconds = 86400;

Devvit.addTrigger({
  events: ['PostCreate', 'PostUpdate'],
  async onEvent(event, context) {
    const authorId = event.author?.id, postId = event.post?.id, currentSubreddit = event.subreddit?.name;
    if (!currentSubreddit) { return void console.error('currentSubreddit is (undefined):', currentSubreddit) }
    if (!authorId) { return void console.error('authorId is (undefined):', authorId) }
    if (!postId) { return void console.error('postId is (undefined):', postId) }
    const authorJson = await context.redis.get(`authorId-${authorId}`);
    const reportablePost = await context.reddit.getPostById(postId);
    if (authorJson) {
      const author = JSON.parse(authorJson) as AuthorData;
      author.lastCheck = new Date(author.lastCheck);
      if (author.isHiding) {
        return void await context.reddit.report(reportablePost, {
          reason: 'from my memory (cache) this user is hiding his history',
        });
      } else if (author.isCalculating) {
        return void console.log(`author (${authorId}) is in calculation`);
      }
    }
    await context.redis.set(`authorId-${authorId}`, JSON.stringify({
      lastCheck: new Date, isHiding: false, isCalculating: true,
    } as AuthorData));
    await context.redis.expire(`authorId-${authorId}`, OneDayInSeconds * 10);
    {
      //= currentSubreddit, to
      const { appVersion } = context;//subredditName = 'r/historyhiders_dev3',
      const authorName = event.author?.name || authorId, author = await context.reddit.getUserById(authorId);
      if (author === undefined) return void console.log(`author (${authorId}) is not found`);

      const posts = (await author.getPosts({ sort: 'new', limit: 500 }).all()).map(m => m.id);
      const comments = (await author.getComments({ sort: 'new', limit: 500 }).all()).map(m => m.id);
      // await context.reddit.modMail.createConversation({
      //   subredditName, to,
      //   subject: `evauluationOf ${authorName}`,
      //   body: `${jsonEncodeIndent({
      //     accountId: authorId,
      //     accountName: authorName,
      //     date: new Date, appVersion,
      //     history: { posts, comments },
      //     currentlyTesting,
      //   }, false)}`,
      // });
      const { redis } = context, hashKey = 'hashKey:' + today();
      await redis.hSet(hashKey, {
        [authorId]: JSON.stringify({
          accountId: authorId,
          accountName: authorName,
          appVersion, currentlyTesting,
          history: { posts, comments },
          date: new Date,
        })
      });
      await redis.expire(hashKey, OneDayInSeconds);
    }
  }
});



async function update(context: TriggerContext) {
  const hourTime = '23', minutes = 0;
  {
    const oldJobId = await context.redis.get('jobId');
    if (oldJobId) await context.scheduler.cancelJob(oldJobId);
    const jobId = await context.scheduler.runJob({
      name: dailyUserPayloadName,
      cron: `${minutes} ${hourTime} * * *`,
      data: {},
    });
    await context.redis.set('jobId', jobId);
  }
}
const dailyUserPayloadName = 'dailyUserPayloadName';
Devvit.addTrigger({ event: 'AppInstall', async onEvent(_, context) { await update(context); }, });
Devvit.addTrigger({ event: 'AppUpgrade', async onEvent(_, context) { await update(context); }, });

Devvit.addSchedulerJob({
  name: dailyUserPayloadName, async onRun(_event, context) {
    await updateWikipage(context);
  },
});

async function updateWikipage(context: TriggerContext | JobContext) {
  const currentSubreddit = context.subredditName;
  if (!currentSubreddit) { return void console.error('currentSubreddit is (undefined):', currentSubreddit) }

  const hashKey = 'hashKey:' + today(), subredditName = 'historyhiders_dev3';
  const items = await context.redis.hGetAll(hashKey);
  let result: { c: any[], date: Date } = { c: [], date: new Date };

  for (const entry of Object.values(items)) {
    const parsed = JSON.parse(entry as string);
    result.c.push(parsed as any);
  }
  const content = jsonEncodeIndent(result, false);
  const reason = `Update of r/${currentSubreddit} at ${Date()}`, page = `subreddits/${currentSubreddit}`;
  await context.reddit.updateWikiPage({ content, subredditName, page, reason, });
}

Devvit.addMenuItem({
  label: 'postNow',
  location: 'subreddit', forUserType: 'moderator',
  async onPress(_event, context) {
    await updateWikipage(context);
  },
});

Devvit.addMenuItem({
  label: 'clear an account',
  location: 'subreddit', forUserType: 'moderator',
  async onPress(_event, context) {
    context.ui.showForm(usernameEvalForm);
  },
});

const usernameEvalForm = Devvit.createForm(
  {
    fields: [
      {
        type: 'string',
        name: 'username',
        label: 'Enter a username',
        helpText: 'the user you want to evaluate. (without u/)',
        required: true,
      },
    ],
    title: 'Evaluate User',
    acceptLabel: 'Submit',
  },
  async function (event, context) {
    const currentUsername = await context.reddit.getCurrentUsername();
    const subredditName = await context.reddit.getCurrentSubredditName();
    if (currentUsername === undefined) return void context.ui.showToast(`there is no currentUser`);
    if (subredditName === undefined) return void context.ui.showToast(`there is no subredditName`);
    const username: string = event.values.username.trim().replace(/^u\//, '') ?? '[undefined]';
    if (/^[a-zA-Z0-9\-_]+$/.test(username)) {

      const id = (await context.reddit.getUserByUsername(username))?.id;
      if (id === undefined) void console.error('user.id is (undefined):', id);
      await context.redis.del(`authorId-${id}`,);

      context.ui.showToast(`Done!`);
    } else if (username === '[undefined]') {
      context.ui.showToast({ text: `there was no username given` });
    } else {
      context.ui.showToast({ text: `that username is syntactically invalid` });
    }
  }
);

export default Devvit;
// function createCronString(hour: number = 0, minute: number = 0) {
//   ([hour, minute] = [hour, minute].map(m => Math.trunc(m))).forEach(m => {
//     if (Number.isNaN(m)) throw new RangeError('createCronString received a nan');
//   });
//   return `${minute} ${hour}`;
// }

