import { faker } from '@faker-js/faker';
import fs from 'fs';
import path from 'path';

type JsonValue = | string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];
type TemplateData = Record<string, JsonValue>;

export class TestDataManager {
    private fixturesBasePath: string;
    private testData: TemplateData;
    
    constructor(private entityType: string) {
        this.fixturesBasePath = path.resolve(process.cwd(), 'test/fixtures');
        this.testData = {};
        this.loadTestData();
    }
  
    private loadTestData(): void {
        const jsonPath = path.join(this.fixturesBasePath, `${this.entityType}.json`);
        if (fs.existsSync(jsonPath)) {
            this.testData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as TemplateData;
        } else {
            console.warn(`No fixture file found for ${this.entityType} at ${jsonPath}`);
        }
    }
  
    getData(templateName: string, modifications: Record<string, any> = {}): any {
        if (!this.testData[templateName]) {
            throw new Error(`Template "${templateName}" not found in ${this.entityType} test data`);
        }
    
        const entityData = JSON.parse(JSON.stringify(this.testData[templateName]));
        const withMods = { ...entityData, ...modifications };
        return this.replaceDynamicFields(withMods);
    }
  
    private replaceDynamicFields(data: any): any {
        for (const key in data) {
            if (typeof data[key] === 'string') {
                data[key] = this.replacePlaceholder(data[key]);
            } else if (typeof data[key] === 'object' && data[key] !== null) {
                data[key] = this.replaceDynamicFields(data[key]);
            }
        }
        return data;
    }
  
    private replacePlaceholder(value: string): string | number {
        if (value === 'DYNAMIC_NAME') return faker.person.fullName();
        if (value === 'DYNAMIC_BID_AMOUNT') return faker.number.int({ min: 100, max: 5000 });
        if (value === 'DYNAMIC_PADDLE_NUMBER') return faker.number.int({ min: 1, max: 100 });
        return value;
    }
}

// Create instances for our entities
export const lotTestData = new TestDataManager('lots');
export const bidTestData = new TestDataManager('bids');
