export type DateTxt = string;

type PartialContribution<dateType extends Date | DateTxt> = { date: dateType };
export type PartialPost<dateType extends Date | DateTxt> = { id: `t3_${string}` } & PartialContribution<dateType>;
export type PartialComment<dateType extends Date | DateTxt> = { id: `t1_${string}` } & PartialContribution<dateType>;

export type UserAccount<dateType extends Date | DateTxt = Date> = {
    accountId: string,
    accountName: string,
    appVersion: `${number}.${number}.${number}`,
    history: {
        posts: PartialPost<dateType>[],
        comments: PartialComment<dateType>[],
    }, date: dateType,
};

export type ResponseUser = {
    aId: string, date: DateTxt, error?: string, appVersion: string,
    h: { equalsInPosts: boolean | null, equalsInComments: boolean | null },
};