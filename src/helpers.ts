// helpets/tx
export function today() {
    return ((new Date).toISOString()).slice(0, 10);
}

export function countItems(of: Iterable<any>, item: any) {
    let count = 0;
    for (let object of Array.from(of)) {
        count += +(object === item);
    } return count;
}