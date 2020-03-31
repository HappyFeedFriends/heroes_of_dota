export type Random_Number_Algorithm = () => number;

export type Entry_With_Weight<T> = {
    element: T
    weight: number
}

export class Random {
    generator: Random_Number_Algorithm;

    constructor(generator: Random_Number_Algorithm) {
        this.generator = generator;
    }

    int_range(lower_bound: number, upper_bound: number) {
        const range = upper_bound - lower_bound;

        return lower_bound + Math.floor(this.generator() * range);
    }

    int_up_to(upper_bound: number) {
        return Math.floor(this.generator() * upper_bound);
    }

    in_array<T>(array: T[], length = array.length): T | undefined {
        if (length == 0) return;

        return array[this.int_up_to(length)];
    }

    pick_n<T>(array: T[], n: number): T[] {
        return this.pick_n_mutable(array.slice(), n);
    }

    pick_n_mutable<T>(array: T[], n: number): T[] {
        const result: T[] = [];

        if (array.length == 0) {
            return result;
        }

        for (; n > 0; n--) {
            const item_index = this.int_up_to(array.length);
            result.push(array.splice(item_index, 1)[0]);

            if (array.length == 0) {
                return result;
            }
        }

        return result;
    }

    pick_n_weighted_mutable<T>(entries: Entry_With_Weight<T>[], n: number): T[] {
        const sum = entries.reduce((prev, curr) => prev + curr.weight, 0);
        const result: T[] = [];

        for (; n > 0; n--) {
            const selected = Math.random() * sum;

            let total = 0;
            let chosen: Entry_With_Weight<T> | undefined = undefined;

            for (let index = 0; index < entries.length; index++) {
                const entry = entries[index];
                total += entry.weight;

                if (selected <= total) {
                    chosen = entry;
                    entries.splice(index, 1);
                    break;
                }
            }

            if (!chosen) {
                chosen = entries.pop();
            }

            if (chosen) {
                result.push(chosen.element);
            }
        }

        return result;
    }
}