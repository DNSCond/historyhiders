import type {Router, Response} from "express-serve-static-core";
import {context, reddit, redis} from "@devvit/web/server";
import type {
    UiResponse,
    OnCommentCreateRequest,
    OnPostCreateRequest,
    TriggerResponse
} from '@devvit/web/shared';
import express from "express";
import {ResolveSecondsAfter} from "anthelpers";
import {RedisList} from "./helpers/RedisList.ts";
import {CONTROLLER, isTestEnv} from "./CarCONST.ts";
import {CSVLikeEncoder} from "../shared/CSVLikeEncoder.ts";


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
        await hourlyCheck(undefined, undefined);
        res.status(200).json({showToast: {appearance: 'success', text: 'success'}} as UiResponse);
    });
router.post('/internal/cron/hourly-check', (req, res) => hourlyCheck(req, res));

async function hourlyCheck(_req?: unknown, res?: Response) {
    const date = new Date;
    if (!isTestEnv) {
        if (date.getHours() % 2 !== 0) {
            return res?.status(200).json({status: 'ok'});
        }
    }
    const list = new RedisList('users'), collection
        = await list.getItemsInsertedBetween(0, date);
    if (!isTestEnv) await list.deleteAllElementsBefore(date);
    const prefix = 'subreddits//', array = {
        users: (await flattenPromiseArray(
            collection.map(({member}) =>
                (member ? redis.get(`authorId-${member}`) : undefined
                )?.then(subredditList => subredditList?.startsWith(prefix) ? (
                    subredditList.slice(prefix.length).split(',')
                ) : undefined).then(subredditIds => (
                    subredditIds ? {userId: member, subredditIds} : undefined
                )) ?? undefinedPromise()
            )
        )).fulfilled.filter(Boolean)
    };
    // @ts-expect-error
    const content = '    ' + CSVLikeEncoder.encode(array.users);
    await reddit.updateWikiPage({
        subredditName: CONTROLLER, content,//: toBase64(encoded) || '*empty*',
        page: "/incomming/sub-" + CONTROLLER.charAt(0),
        reason: `r/${context.subredditName}//${Date()}`,
    });
    res?.status(200).json({status: 'ok'});
}

router.post<string, never>("/internal/menu/check-status",
    async (_req, res) => {
        const calculatingKey = `authorId-${context.userId}`, lastCheckedAt =
            await redis.get(`lastCheckedAt-${calculatingKey}`);
        if (lastCheckedAt) {
            res.status(200).json({
                showToast: {
                    appearance: 'success',
                    text: `you were checked at ${new Date(lastCheckedAt)}`
                }
            } as UiResponse);
        } else {
            res.status(200).json({
                showToast: {
                    appearance: 'success',
                    text: 'you were not checked in the last day'
                }
            } as UiResponse);
        }
    });
router.post<string, never>("/internal/menu/delete-status",
    async (_req, res) => {
        const calculatingKey = `authorId-${context.userId}`;
        await redis.del(`lastCheckedAt-${calculatingKey}`);
        await redis.get(calculatingKey);
        res.status(200).json({
            showToast: {
                appearance: 'success',
                text: 'Deleted'
            }
        } as UiResponse);
    });

function flattenPromiseArray<T = any>(array: Promise<T>[]): Promise<{ fulfilled: T[], rejected: any[] }> {
    return Promise.allSettled(array).then(promiseSettledResult => {
        // noinspection JSPrimitiveTypeWrapperUsage
        const result = {fulfilled: Array<T>(), rejected: new Array};
        for (const promiseSettledResultElement of promiseSettledResult) {
            // @ts-expect-error
            result[promiseSettledResultElement.status].push(promiseSettledResultElement.value ?? promiseSettledResultElement.reason);
        }
        return result;
    });
}

function undefinedPromise(): Promise<undefined> {
    return new Promise<undefined>(resolve => resolve(undefined))
}


/*function redditReport(id: string, reason: string): any {
    // @ts-expect-error
    return reddit.report({id}, {reason});
}*/
