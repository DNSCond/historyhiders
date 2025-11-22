export type DateTxt = string;

type PartialContribution = { date: Date };
export type PartialPost = { id: `t3_${string}` } & PartialContribution;
export type PartialComment = { id: `t1_${string}` } & PartialContribution;

export type UserAccount = {
    accountId: string,
    accountName: string,
    appVersion: `${number}.${number}.${number}`,
    history: {
        posts: PartialPost[],
        comments: PartialComment[],
    }, date: Date,
};
