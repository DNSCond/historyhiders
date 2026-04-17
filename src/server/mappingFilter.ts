export const toolBox: Readonly<{
    [Symbol.toStringTag]: string;
    removeItem: symbol;
}> = Object.freeze({
    [Symbol.toStringTag]: 'toolBox',
    removeItem: Symbol('removeItem'),
});


export function mappingFilter<Old, New>(array: Old[], callBack: (this: typeof toolBox, element: Old,
    index: number, array: Old[], toolbox: typeof toolBox) => New | (typeof toolBox)[keyof typeof toolBox]): New[] {
    const result: New[] = []; let index = 0;
    for (const element of array) {
        const object = Reflect.apply(callBack, toolBox, [element, index++, array, toolBox]);
        if (toolBox.removeItem === object) continue;
        result.push(object as New);
    } return result;
}
