import { Devvit, JobContext, TriggerContext } from "@devvit/public-api";
import { jsonEncodeIndent } from "anthelpers";
import { today } from "./helpers.js";
import { ResponseUser, UserAccount } from "./types.js";

Devvit.configure({ redditAPI: true, redis: true });

type AuthorData = {
  lastCheck: Date,
  isHiding: boolean,
  isCalculating: boolean,
  equalsInPosts?: boolean,
  equalsInComments?: boolean,
};

const OneDayInSeconds = 86400;

Devvit.addTrigger({
  events: ['PostCreate', 'PostUpdate'],
  async onEvent(event, context) {
    const { authorId, postId } = await valiDatePossibillity(event, context, 'post');
    const authorJson = await context.redis.get(`authorId-${authorId}`);
    const reportablePost = await context.reddit.getPostById(postId);
    await ifHiding(event, context, authorJson, authorId, reportablePost);
  }
});

Devvit.addTrigger({
  events: ['CommentCreate', 'CommentUpdate'],
  async onEvent(event, context) {
    const { authorId, postId } = await valiDatePossibillity(event, context, 'comment');
    const authorJson = await context.redis.get(`authorId-${authorId}`);
    const reportablePost = await context.reddit.getCommentById(postId);
    await ifHiding(event, context, authorJson, authorId, reportablePost);
  }
});
async function valiDatePossibillity(event: any, _context: TriggerContext, type: 'post' | 'comment') {
  const authorId = event.author?.id, postId = event[type]?.id, currentSubreddit = event.subreddit?.name;
  if (!currentSubreddit) { console.error('currentSubreddit is (undefined):', currentSubreddit); throw new TypeError('currentSubreddit is (undefined)') }
  if (!authorId) { console.error('authorId is (undefined):', authorId); throw new TypeError('authorId is (undefined)') }
  if (!postId) { console.error(type + 'Id is (undefined):', postId); throw new TypeError(type + 'Id is (undefined):') }
  return { authorId, postId, currentSubreddit };
}

async function ifHiding(event: any, context: TriggerContext, authorJson: any, authorId: string, reportablePost: any) {
  if (authorJson) {
    const author = JSON.parse(authorJson) as AuthorData;
    author.lastCheck = new Date(author.lastCheck);
    if (author.isHiding) {
      return void await context.reddit.report(reportablePost, {
        reason: 'from my memory (cache) this user is hiding his history',
      });
    } else if (author.isCalculating) {
      return void console.log(`author (${authorId}, ${Date()}) is in calculation`);
    }
  }
  await context.redis.set(`authorId-${authorId}`, JSON.stringify({
    lastCheck: new Date, isHiding: false, isCalculating: true,
  } as AuthorData));
  await context.redis.expire(`authorId-${authorId}`, OneDayInSeconds * 28);
  {
    //= currentSubreddit, to
    const { appVersion } = context;//subredditName = 'r/historyhiders_dev3',
    const authorName = event.author?.name || authorId, author = await context.reddit.getUserById(authorId);
    if (author === undefined) return void console.log(`author (${authorId}) is not found`);

    const posts = (await author.getPosts({ sort: 'new', limit: 500 }).all()).map(m => ({ id: m.id, date: m.createdAt }));
    const comments = (await author.getComments({ sort: 'new', limit: 500 }).all()).map(m => ({ id: m.id, date: m.createdAt }));
    const { redis } = context, hashKey = 'hashKey:' + today();
    await redis.hSet(hashKey, {
      [authorId]: JSON.stringify({
        accountId: authorId,
        accountName: authorName,
        appVersion, date: new Date,
        history: { posts, comments },
      } as UserAccount<Date>)
    });
    await redis.expire(hashKey, OneDayInSeconds);
  }
}

async function update(context: TriggerContext) {
  {
    const hourTime = '22';
    const minutes = 0;
    const oldJobId = await context.redis.get('jobId');
    if (oldJobId) await context.scheduler.cancelJob(oldJobId);
    const jobId = await context.scheduler.runJob({
      name: dailyUserPayloadName,
      cron: `${minutes} ${hourTime} * * *`,
      data: {},
    });
    await context.redis.set('jobId', jobId);
  }
  {
    const hourTime = '23';
    const minutes = 0;
    const oldJobId = await context.redis.get('jobId-daily_receiver');
    if (oldJobId) await context.scheduler.cancelJob(oldJobId);
    const jobId = await context.scheduler.runJob({
      name: 'daily_receiver',
      cron: `${minutes} ${hourTime} * * *`,
      data: {},
    });
    await context.redis.set('jobId-daily_receiver', jobId);
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
Devvit.addSchedulerJob({
  name: 'daily_receiver', async onRun(_event, context) {
    await daily_receiver(context);
  },
});

async function updateWikipage(context: TriggerContext | JobContext) {
  const currentSubreddit = context.subredditName;
  if (!currentSubreddit) { return void console.error('currentSubreddit is (undefined):', currentSubreddit) }

  const hashKey = 'hashKey:' + today(), subredditName = 'historyhiders_dev3';
  const items = await context.redis.hGetAll(hashKey);
  let result: { c: UserAccount[], date: Date } = { c: [], date: new Date };

  for (const entry of Object.values(items)) {
    const parsed = JSON.parse(entry as string);
    result.c.push(parsed as UserAccount);
  }
  const content = jsonEncodeIndent(result, false);
  const reason = `Update of r/${currentSubreddit} at ${Date()}`, page = `subreddits/${currentSubreddit}`;
  await context.reddit.updateWikiPage({ content, subredditName, page, reason });
}

async function daily_receiver(context: TriggerContext | JobContext) {
  const currentSubreddit = context.subredditName;
  if (!currentSubreddit) { return void console.error('currentSubreddit is (undefined):', currentSubreddit) }
  const page = `wordcounter`, now = (new Date).setUTCHours(0, 0, 0, 0);
  const wikipage = await context.reddit.getWikiPage('historyhiders_dev3', page);
  const jsonic = JSON.parse(wikipage.content);
  // for (const element of jsonic) {
  //   const authorId = element.aId, { equalsInPosts, equalsInComments } = element.h;
  //   const isHiding = (equalsInPosts && equalsInComments) === false;
  //   await context.redis.set(`authorId-${authorId}`, JSON.stringify({
  //     lastCheck: new Date, isCalculating: false,
  //     equalsInPosts, equalsInComments, isHiding,
  //   } as AuthorData));
  //   await context.redis.expire(`authorId-${authorId}`, OneDayInSeconds * 10);
  // }
  const sorted = Object.entries(jsonic).map(([dateString, postId]) => ({ date: new Date(dateString), postId }))
    .sort((a, b) => +a.date - +b.date) as { date: Date, postId: string }[];
  const posts: ({ date: Date; json: any; } | undefined)[] =
    (await Promise.allSettled(sorted.filter(m => (now - +m.date) < OneDayInSeconds * 3)
      .map(m => context.reddit.getPostById(m.postId))))
      .map(promieResult => {
        if (promieResult.status === 'fulfilled') {
          const date = promieResult.value.createdAt;
          const json = JSON.parse(promieResult.value.body ?? 'null');
          return { date, json };
        }
      });
  const json = posts[0]?.json;
  if (json) {
    for (const element of json as ResponseUser[]) {
      const { aId, date, h } = element;
      await context.redis.set(`authorId-${aId}`, JSON.stringify({
        lastCheck: new Date(date), isCalculating: false,
        isHiding: !h.equalsInComments || !h.equalsInPosts,
        equalsInComments: !h.equalsInComments,
        equalsInPosts: !h.equalsInPosts,
      } as AuthorData));
    }
  } else {
    console.error('json is undefined');
  }
}

Devvit.addMenuItem({
  label: 'postNow (History Hiders)',
  description: 'History Hiders',
  location: 'subreddit', forUserType: 'moderator',
  async onPress(_event, context) {
    await updateWikipage(context);
    context.ui.showToast('hiding in hibernation?')
  },
});

Devvit.addMenuItem({
  label: 'findNow (History Hiders)',
  description: 'History Hiders',
  location: 'subreddit', forUserType: 'moderator',
  async onPress(_event, context) {
    await daily_receiver(context);
    context.ui.showToast('Done!');
  },
});

Devvit.addMenuItem({
  label: 'Evaluate an account',
  description: 'HistoryHiders',
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
      const authorData = JSON.parse((await context.redis.get(`authorId-${id}`)) ?? 'null') as AuthorData | null;
      if (!authorData) return context.ui.showToast(`user is not found in our registery!`);
      context.ui.showToast(`hiding: ${authorData.isHiding}, isCalculating: ${authorData.isCalculating}, allPosts: ${authorData.equalsInPosts}, allComms: ${authorData.equalsInComments}`);

      context.ui.showToast(`Done!`);
    } else if (username === '[undefined]') {
      context.ui.showToast({ text: `there was no username given` });
    } else {
      context.ui.showToast({ text: `that username is syntactically invalid` });
    }
  }
);

Devvit.addMenuItem({
  label: 'goto account from id',
  description: 'HistoryHiders',
  location: 'subreddit',
  async onPress(_event, context) {
    context.ui.showForm(usernameGoToForm);
  },
});

const usernameGoToForm = Devvit.createForm(
  {
    fields: [
      {
        type: 'string',
        name: 'username',
        label: 'Enter a userId',
        helpText: 'the user you want to goto. (without u/)',
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
    try {
      const userId: string = event.values.username.trim(), user = await context.reddit.getUserById(userId);
      if (user) {
        context.ui.navigateTo(`https://www.reddit.com/user/${user.username}/`);
      } else {
        context.ui.showToast('not found');
      }
    } catch (error) {
        context.ui.showToast(String(error));
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

