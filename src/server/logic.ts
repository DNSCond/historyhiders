import type {Router, Response} from "express-serve-static-core";
import {context, reddit, redis} from "@devvit/web/server";
import {UserMessage} from "./userdata-protobuf";
import type {
    UiResponse,
    OnCommentCreateRequest,
    OnPostCreateRequest,
    TriggerResponse
} from '@devvit/web/shared';
import express from "express";
import {ResolveSecondsAfter} from "anthelpers";
import {RedisList} from "./helpers/RedisList.ts";
import {CONTROLLER} from "./CarCONST.ts";


export const router: Router = express.Router(), OneDayInSeconds = 86400;

router.post<string, never, TriggerResponse, OnCommentCreateRequest | OnPostCreateRequest>
('/internal/triggers/contribution-create', async (req, res): Promise<void> => {
    // const message= UserMessage.decode(req.body);
    const {/*type,subreddit,*/ author} = req.body, date = new Date;
    if (author === undefined) {
        res.status(500).json({});
        return;
    }
    // @ts-expect-error
    const authorId = author.id, user = await reddit.getUserById(authorId),
        calculatingKey = `authorId-${authorId}`, expiration = ResolveSecondsAfter(500, date);
    if ((await redis.get(calculatingKey)) || (await redis.get(`lastCheckedAt-${calculatingKey}`))) {
        res.status(200).json({});
        return;
    } else if (user === undefined) {
        res.status(500).json({});
        return;
    }
    await redis.set(`lastCheckedAt-${calculatingKey}`, date.toString(),
        {expiration: ResolveSecondsAfter(OneDayInSeconds, date)});
    // let body: string | null;
    // switch (type) {
    //     case "CommentCreate": {
    //         ({body} = req.body.comment ?? {body: null});
    //     }
    //         break;
    //     case "PostCreate": {
    //         const {selftext} = req.body.post ?? {selftext: null};
    //         body = selftext;
    //     }
    //         break;
    //     default:
    //         res.status(500).json({});
    // throw TypeError('type isnt valid');}
    await redis.set(calculatingKey, 'processing//', {expiration});
    const subreddits = new Set<string>;
    for await (let post of user.getPosts({sort: 'new', limit: 500})) {
        subreddits.add(post.subredditId);
    }
    for await (let comment of user.getComments({sort: 'new', limit: 500})) {
        subreddits.add(comment.subredditId);
    }
    await redis.set(calculatingKey, 'subreddits//' + [...subreddits].toString(), {expiration});
    await (new RedisList('users')).addElement(authorId);
});

router.post<string, never>('/internal/menu/activate-now',
    async (_req, res) => {
        await hourlyCheck(undefined, undefined, true);
        res.status(200).json({showToast: {appearance: 'success', text: 'success'}} as UiResponse);
    });
router.post('/internal/cron/hourly-check', (req, res) => hourlyCheck(req, res));

async function hourlyCheck(_req?: unknown, res?: Response, isTestEnv?: boolean) {
    const date = new Date;
    if (!isTestEnv) {
        if (date.getHours() % 2 !== 0) {
            return res?.status(200).json({status: 'ok'});
        }
    }
    const list = new RedisList('users'), collection
        = await list.getItemsInsertedBetween(0, date);
    if (!isTestEnv) await list.deleteAllElementsBefore(date);
    const prefix = 'subreddits//';
    const array: UserMessage = {users: Array()};
    for (const {member} of collection) {
        // @ts-expect-error
        const user = await reddit.getUserById(member);
        const callbackResult = await (user ? redis.get(`authorId-${user}`) : undefined)?.then(user => {
            const subredditListPromise = user ? redis.get(`authorId-${user}`) : undefined;
            return subredditListPromise?.then(subredditList => ({
                userId: member,
                subredditIds: subredditList?.startsWith(prefix) ? (
                    subredditList.slice(prefix.length).split(',')
                ) : undefined,
            }));
        });
        if (callbackResult?.subredditIds) {
            array.users.push(callbackResult as { userId: string, subredditIds: string[] });
        }
    }
    const content = JSON.stringify(array);
    await reddit.updateWikiPage({
        subredditName: CONTROLLER, content,//: toBase64(encoded) || '*empty*',
        page: "/incomming/sub-" + CONTROLLER.charAt(0),
        reason: `r/${context.subredditName}//${Date()}`,
    });
    res?.status(200).json({status: 'ok'});
}

/*function redditReport(id: string, reason: string): any {
    // @ts-expect-error
    return reddit.report({id}, {reason});
}*/
