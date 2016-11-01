/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    // d3
    import Selection = d3.Selection;
    import UpdateSelection = d3.selection.Update;
    import Transition = d3.Transition;

    // jsCommon
    import createClassAndSelector = jsCommon.CssConstants.createClassAndSelector;
    import ClassAndSelector = jsCommon.CssConstants.ClassAndSelector;

    // powerbi
    import IViewport = powerbi.IViewport;
    import DataView = powerbi.DataView;
    import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
    import IEnumType = powerbi.IEnumType;
    import IEnumMember = powerbi.IEnumMember;
    import DataViewObjects = powerbi.DataViewObjects;
    import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
    import VisualObjectInstance = powerbi.VisualObjectInstance;
    import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
    import DataViewValueColumns = powerbi.DataViewValueColumns;
    import DataViewCategoricalColumn = powerbi.DataViewCategoricalColumn;
    import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
    import DataViewValueColumn = powerbi.DataViewValueColumn;
    import VisualDataRoleKind = powerbi.VisualDataRoleKind;
    import TextMeasurementService = powerbi.TextMeasurementService;

    // powerbi.data
    import Selector = powerbi.data.Selector;

    // powerbi.extensibility
    import IVisual = powerbi.extensibility.IVisual;
    import IColorPalette = powerbi.extensibility.IColorPalette;
    import ISelectionManager = powerbi.extensibility.ISelectionManager;

    // powerbi.extensibility.visual
    import IVisualHost = powerbi.extensibility.visual.IVisualHost;
    import ISelectionIdBuilder = powerbi.extensibility.ISelectionIdBuilder;
    import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
    import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;

    // powerbi.visuals
    import ValueFormatter = powerbi.visuals.valueFormatter;
    import ISelectionId = powerbi.visuals.ISelectionId;
    import IMargin = powerbi.visuals.IMargin;
    import ColorHelper = powerbi.visuals.ColorHelper;
    import SVGUtil = powerbi.visuals.SVGUtil;
    import IPoint = powerbi.visuals.shapes.IPoint;
    import IValueFormatter = powerbi.visuals.IValueFormatter;

    export enum WordCloudScaleType {
        logn,
        sqrt,
        value
    };

    export interface WordCloudText {
        text: string;
        textGroup: string;
        count: number;
        index: number;
        selectionId: ISelectionId;
        color: string;
    }

    export interface WordCloudDataPoint extends IPoint {
        text: string;
        xOff: number;
        yOff: number;
        rotate?: number;
        size?: number;
        padding: number;
        width: number;
        height: number;
        sprite?: number[];
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        color: string;
        selectionIds: ISelectionId[];
        wordIndex: number;
        getWidthOfWord?: () => number;
        count: number;
        widthOfWord?: number;
    }

    export interface WordCloudData {
        dataView: DataView;
        settings: WordCloudSettings;
        texts: WordCloudText[];
        dataPoints: WordCloudDataPoint[];
    }

    export interface WordCloudDataView {
        data: WordCloudDataPoint[];
        leftBorder: IPoint;
        rightBorder: IPoint;
    }

    export interface WordCloudConstructorOptions {
        svg?: d3.Selection<any>;
        // animator?: IGenericAnimator;
        margin?: IMargin;
    }

    class ValueSelectionManager<T> {
        private selectedValuesValue: T[] = [];
        private hostServices: IVisualHost;
        private getSelectionIds: (value: T | T[]) => ISelectionId[];
        private selectionManager: ISelectionManager;

        public constructor(hostServices: IVisualHost, getSelectionIds: (value: T) => ISelectionId[]) {
            this.hostServices = hostServices;
            // this.selectionManager = new SelectionManager({ hostServices: hostServices }); // TODO: check it

            this.getSelectionIds = (value) => _.isArray(value)
                ? <ISelectionId[]>_.flatten((<T[]>value).map(x => getSelectionIds(x)))
                : getSelectionIds(<T>value);
        }

        public get selectedValues(): T[] {
            return this.selectedValuesValue;
        }

        public get selectionIds(): ISelectionId[] {
            return this.getSelectionIds(this.selectedValues);
        }

        public get hasSelection(): boolean {
            return this.selectedValues.length > 0;
        }

        public get getSelectionIdValues() {
            return this.selectedValues.map(v => { return { value: v, selectionId: this.getSelectionIds(v) }; });
        }

        public selectAndSendSelection(value: T[] | T, multiSelect: boolean = false): JQueryDeferred<ISelectionId[]> {
            var values = <T[]>(_.isArray(value) ? value : [value]);
            if ((this.hostServices as any).shouldRetainSelection()) { // TODO: check it.
                return this.sendSelectionToHost(this.getSelectionIds(values));
            } else {
                this.selectInternal(values, multiSelect);
                return this.sendSelection();
            }
        }

        public select(value: T[] | T, multiSelect: boolean = false) {
            var values = <T[]>(_.isArray(value) ? value : [value]);
            this.selectInternal(values, multiSelect);
        }

        public isSelected(selectionId: T[] | T): boolean {
            var values = <T[]>(_.isArray(selectionId) ? selectionId : [selectionId]);
            return values.every(v => this.selectedValues.some(s => s === v));
        }

        public sendSelection(): JQueryDeferred<ISelectionId[]> {
            return this.sendSelectionToHost(this.selectionIds);
        }

        public clear(sendToHost: boolean): JQueryDeferred<{}> {
            this.selectedValues.length = 0;

            if (sendToHost) {
                return this.sendSelection();
            }

            return $.Deferred().resolve();
        }

        private selectInternal(values: T[], multiSelect: boolean) {
            var resultValues = [];

            if (this.isSelected(values)) {
                resultValues = multiSelect
                    ? this.selectedValues.filter(s => !values.some(v => v === s))
                    : this.selectedValues.length === values.length ? [] : values;
            } else {
                resultValues = multiSelect
                    ? values.filter(x => !this.isSelected(x)).concat(this.selectedValues)
                    : values;
            }

            this.selectedValues.length = 0;
            resultValues.forEach(x => this.selectedValues.push(x));
        }

        private sendSelectionToHost(ids: ISelectionId[]): JQueryDeferred<ISelectionId[]> {
            var deferred: JQueryDeferred<Selector[]> = $.Deferred();
            (<any>this.selectionManager).sendSelectionToHost(ids);
            deferred.resolve(this.selectionIds);

            return deferred;
        }
    }

    class VisualLayout {
        private marginValue: IMargin;
        private viewportValue: IViewport;
        private viewportInValue: IViewport;
        private minViewportValue: IViewport;
        private originalViewportValue: IViewport;
        private previousOriginalViewportValue: IViewport;

        public defaultMargin: IMargin;
        public defaultViewport: IViewport;

        constructor(defaultViewport?: IViewport, defaultMargin?: IMargin) {
            this.defaultViewport = defaultViewport || { width: 0, height: 0 };
            this.defaultMargin = defaultMargin || { top: 0, bottom: 0, right: 0, left: 0 };
        }

        public get viewport(): IViewport {
            return this.viewportValue || (this.viewportValue = this.defaultViewport);
        }

        public get viewportCopy(): IViewport {
            return _.clone(this.viewport);
        }

        // Returns viewport minus margin
        public get viewportIn(): IViewport {
            return this.viewportInValue || this.viewport;
        }

        public get minViewport(): IViewport {
            return this.minViewportValue || { width: 0, height: 0 };
        }

        public get margin(): IMargin {
            return this.marginValue || (this.marginValue = this.defaultMargin);
        }

        public set minViewport(value: IViewport) {
            this.setUpdateObject(value, v => this.minViewportValue = v, VisualLayout.restrictToMinMax);
        }

        public set viewport(value: IViewport) {
            this.previousOriginalViewportValue = _.clone(this.originalViewportValue);
            this.originalViewportValue = _.clone(value);
            this.setUpdateObject(value,
                v => this.viewportValue = v,
                o => VisualLayout.restrictToMinMax(o, this.minViewport));
        }

        public set margin(value: IMargin) {
            this.setUpdateObject(value, v => this.marginValue = v, VisualLayout.restrictToMinMax);
        }

        // Returns true if viewport has updated after last change.
        public get viewportChanged(): boolean {
            return !!this.originalViewportValue && (!this.previousOriginalViewportValue
                || this.previousOriginalViewportValue.height !== this.originalViewportValue.height
                || this.previousOriginalViewportValue.width !== this.originalViewportValue.width);
        }

        public get viewportInIsZero(): boolean {
            return this.viewportIn.width === 0 || this.viewportIn.height === 0;
        }

        public resetMargin(): void {
            this.margin = this.defaultMargin;
        }

        private update(): void {
            this.viewportInValue = VisualLayout.restrictToMinMax({
                width: this.viewport.width - (this.margin.left + this.margin.right),
                height: this.viewport.height - (this.margin.top + this.margin.bottom)
            }, this.minViewportValue);
        }

        private setUpdateObject<T>(object: T, setObjectFn: (T) => void, beforeUpdateFn?: (T) => void): void {
            object = _.clone(object);
            setObjectFn(VisualLayout.createNotifyChangedObject(object, o => {
                if (beforeUpdateFn) beforeUpdateFn(object);
                this.update();
            }));

            if (beforeUpdateFn) beforeUpdateFn(object);
            this.update();
        }

        private static createNotifyChangedObject<T>(object: T, objectChanged: (o?: T, key?: string) => void): T {
            var result: T = <any>{};
            _.keys(object).forEach(key => Object.defineProperty(result, key, {
                get: () => object[key],
                set: (value) => { object[key] = value; objectChanged(object, key); },
                enumerable: true,
                configurable: true
            }));
            return result;
        }

        private static restrictToMinMax<T>(value: T, minValue?: T): T {
            _.keys(value).forEach(x => value[x] = Math.max(minValue && minValue[x] || 0, value[x]));
            return value;
        }
    }

    export class WordCloudSettings {
        public static get Default() {
            return new this();
        }

        public static parse(dataView: DataView) {
            var settings = new this();
            /*if (!dataView || !dataView.metadata || !dataView.metadata.objects) {
                return settings;
            }

            var properties = this.getProperties(capabilities);
            for (var objectKey in capabilities.objects) {
                for (var propKey in capabilities.objects[objectKey].properties) {
                    if (!settings[objectKey] || !_.has(settings[objectKey], propKey)) {
                        continue;
                    }

                    var type = capabilities.objects[objectKey].properties[propKey].type;
                    var getValueFn = this.getValueFnByType(type);
                    settings[objectKey][propKey] = getValueFn(
                        dataView.metadata.objects,
                        properties[objectKey][propKey],
                        settings[objectKey][propKey]);
                }
            }*/

            return settings;
        }

        // public static getProperties(capabilities: VisualCapabilities):
        //     { [i: string]: { [i: string]: DataViewObjectPropertyIdentifier } } & {
        //         general: { formatString: DataViewObjectPropertyIdentifier },
        //         dataPoint: { fill: DataViewObjectPropertyIdentifier }
        //     } {
        //     var objects = _.merge({
        //         general: { properties: { formatString: {} } }
        //     }, capabilities.objects);
        //     var properties = <any>{};
        //     for (var objectKey in objects) {
        //         properties[objectKey] = {};
        //         for (var propKey in objects[objectKey].properties) {
        //             properties[objectKey][propKey] = <DataViewObjectPropertyIdentifier>{
        //                 objectName: objectKey,
        //                 propertyName: propKey
        //             };
        //         }
        //     }

        //     return properties;
        // }

        // public static createEnumTypeFromEnum(type: any): IEnumType {
        //     var even: any = false;
        //     return createEnumType(Object.keys(type)
        //         .filter((key, i) => ((!!(i % 2)) === even && type[key] === key
        //             && !void (even = !even)) || (!!(i % 2)) !== even)
        //         .map(x => <IEnumMember>{ value: x, displayName: x }));
        // }

        // private static getValueFnByType(type: DataViewObjectPropertyTypeDescriptor) {
        //     switch (_.keys(type)[0]) {
        //         case "fill":
        //             return DataViewObjects.getFillColor;
        //         default:
        //             return DataViewObjects.getValue;
        //     }
        // }

        // public static enumerateObjectInstances(
        //     settings = new this(),
        //     options: EnumerateVisualObjectInstancesOptions,
        //     capabilities: VisualCapabilities): ObjectEnumerationBuilder {

        //     var enumeration = new ObjectEnumerationBuilder();
        //     var object = settings && settings[options.objectName];
        //     if (!object) {
        //         return enumeration;
        //     }

        //     var instance = <VisualObjectInstance>{
        //         objectName: options.objectName,
        //         selector: null,
        //         properties: {}
        //     };

        //     for (var key in object) {
        //         if (_.has(object, key)) {
        //             instance.properties[key] = object[key];
        //         }
        //     }

        //     enumeration.pushInstance(instance);
        //     return enumeration;
        // }

        // public originalSettings: WordCloudSettings;
        // public createOriginalSettings(): void {
        //     this.originalSettings = _.cloneDeep(this);
        // }

        //Default Settings
        public general = {
            maxNumberOfWords: 200,
            minFontSize: 20 / WordCloud.FontSizePercentageCoefficent,
            maxFontSize: 100 / WordCloud.FontSizePercentageCoefficent,
            isBrokenText: true
        };
        public stopWords = {
            show: true,
            isDefaultStopWords: false,
            words: null
        };
        public rotateText = {
            show: true,
            minAngle: -60,
            maxAngle: 90,
            maxNumberOfOrientations: 2
        };
    }

    export class WordCloudColumns<T> {
        public static Roles = Object.freeze(
            _.mapValues(new WordCloudColumns<string>(), (x, i) => i));

        public static getColumnSources(dataView: DataView) {
            return this.getColumnSourcesT<DataViewMetadataColumn>(dataView);
        }

        public static getTableValues(dataView: DataView) {
            var table = dataView && dataView.table;
            var columns = this.getColumnSourcesT<any[]>(dataView);
            return columns && table && _.mapValues(
                columns, (n: DataViewMetadataColumn, i) => n && table.rows.map(row => row[n.index]));
        }

        public static getTableRows(dataView: DataView) {
            var table = dataView && dataView.table;
            var columns = this.getColumnSourcesT<any[]>(dataView);
            return columns && table && table.rows.map(row =>
                _.mapValues(columns, (n: DataViewMetadataColumn, i) => n && row[n.index]));
        }

        public static getCategoricalValues(dataView: DataView) {
            var categorical = dataView && dataView.categorical;
            var categories = categorical && categorical.categories || [];
            var values = categorical && categorical.values || <DataViewValueColumns>[];
            var series = categorical && values.source && this.getSeriesValues(dataView);
            return categorical && _.mapValues(new this<any[]>(), (n, i) =>
                (<DataViewCategoricalColumn[]>_.toArray(categories)).concat(_.toArray(values))
                    .filter(x => x.source.roles && x.source.roles[i]).map(x => x.values)[0]
                || values.source && values.source.roles && values.source.roles[i] && series);
        }

        public static getSeriesValues(dataView: DataView) {
            return dataView && dataView.categorical && dataView.categorical.values
                && dataView.categorical.values.map(x => {
                    return (x.source.groupName !== undefined)
                        ? x.source.groupName
                        : x.source.queryName;
                });
        }

        public static getCategoricalColumns(dataView: DataView) {
            var categorical = dataView && dataView.categorical;
            var categories = categorical && categorical.categories || [];
            var values = categorical && categorical.values || <DataViewValueColumns>[];
            return categorical && _.mapValues(
                new this<DataViewCategoryColumn & DataViewValueColumn[] & DataViewValueColumns>(),
                (n, i) => categories.filter(x => x.source.roles && x.source.roles[i])[0]
                    || values.source && values.source.roles && values.source.roles[i] && values
                    || values.filter(x => x.source.roles && x.source.roles[i]));
        }

        private static getColumnSourcesT<T>(dataView: DataView) {
            var columns = dataView && dataView.metadata && dataView.metadata.columns;
            return columns && _.mapValues(
                new this<T>(), (n, i) => columns.filter(x => x.roles && x.roles[i])[0]);
        }

        //Data Roles
        public Category: T = null;
        public Values: T = null;
    }

    export class WordCloud implements IVisual {
        private static ClassName: string = "wordCloud";

        private static Words: ClassAndSelector = createClassAndSelector("words");
        private static WordGroup: ClassAndSelector = createClassAndSelector("word");

        private static Size: string = "px";
        private static StopWordsDelemiter: string = " ";

        private static Radians: number = Math.PI / 180;

        private static MinAngle: number = -180;
        private static MaxAngle: number = 180;

        private static MaxNumberOfWords: number = 2500;

        private static MinOpacity: number = 0.2;
        private static MaxOpacity: number = 1;

        public static FontSizePercentageCoefficent = 1;

        private static Punctuation: string[] = [
            "!", ".", ":", "'", ";", ",", "!",
            "@", "#", "$", "%", "^", "&", "*",
            "(", ")", "[", "]", "\"", "\\", "/",
            "-", "_", "+", "="
        ];

        private static StopWords: string[] = [
            "a", "able", "about", "across", "after", "all", "almost", "also", "am", "among", "an",
            "and", "any", "are", "as", "at", "be", "because", "been", "but", "by", "can", "cannot",
            "could", "did", "do", "does", "either", "else", "ever", "every", "for", "from", "get",
            "got", "had", "has", "have", "he", "her", "hers", "him", "his", "how", "however", "i",
            "if", "in", "into", "is", "it", "its", "just", "least", "let", "like", "likely", "may",
            "me", "might", "most", "must", "my", "neither", "no", "nor", "not", "of", "off", "often",
            "on", "only", "or", "other", "our", "own", "rather", "said", "say", "says", "she", "should",
            "since", "so", "some", "than", "that", "the", "their", "them", "then", "there", "these",
            "they", "this", "tis", "to", "too", "twas", "us", "wants", "was", "we", "were", "what",
            "when", "where", "which", "while", "who", "whom", "why", "will", "with", "would", "yet",
            "you", "your"
        ];

        private static DefaultMargin: IMargin = {
            top: 10,
            right: 10,
            bottom: 10,
            left: 10
        };

        public static converter(dataView: DataView, colors: IColorPalette, previousData: WordCloudData): WordCloudData {
            var categorical = WordCloudColumns.getCategoricalColumns(dataView),
                catValues: WordCloudColumns<any[]>,
                properties,
                settings: WordCloudSettings,
                colorHelper: ColorHelper,
                stopWords: string[],
                texts: WordCloudText[],
                reducedTexts: WordCloudText[][],
                dataPoints: WordCloudDataPoint[],
                wordValueFormatter: IValueFormatter,
                queryName: string;

            if (!categorical || !categorical.Category || _.isEmpty(categorical.Category.values)) {
                return null;
            }

            catValues = WordCloudColumns.getCategoricalValues(dataView);
            // properties = WordCloudSettings.getProperties(WordCloud.capabilities); // TODO: check it
            settings = WordCloud.parseSettings(dataView, previousData && previousData.settings);

            wordValueFormatter = ValueFormatter.create({
                format: ValueFormatter.getFormatString(
                    categorical.Category.source,
                    properties.general.formatString)
            });

            stopWords = _.isString(settings.stopWords.words)
                ? settings.stopWords.words.split(WordCloud.StopWordsDelemiter)
                : [];

            stopWords = settings.stopWords.isDefaultStopWords
                ? stopWords.concat(WordCloud.StopWords)
                : stopWords;

            colorHelper = new ColorHelper(
                colors,
                properties.dataPoint.fill,
                wordCloudUtils.getRandomColor());

            queryName = (categorical.Values
                && categorical.Values[0]
                && categorical.Values[0].source
                && categorical.Values[0].source.queryName)
                || null;

            texts = catValues.Category
                .filter(x => x !== null && x !== undefined && x.toString().length > 0)
                .map((item: string, index: number) => {
                    var color: string,
                        selectionIdBuilder: ISelectionIdBuilder;

                    if (categorical.Category.objects && categorical.Category.objects[index]) {
                        color = wordCloudUtils.hexToRgb(colorHelper.getColorForMeasure(
                            categorical.Category.objects[index], ""));
                    } else {
                        color = previousData && previousData.texts && previousData.texts[index]
                            ? previousData.texts[index].color
                            : wordCloudUtils.getRandomColor();
                    }

                    /*selectionIdBuilder = new SelectionIdBuilder()
                        .withCategory(dataView.categorical.categories[0], index);*/ // TODO: check it

                    if (queryName) {
                        selectionIdBuilder.withMeasure(queryName);
                    }

                    item = wordValueFormatter.format(item);

                    return {
                        text: item,
                        count: (catValues.Values
                            && catValues.Values[index]
                            && !isNaN(catValues.Values[index]))
                            ? catValues.Values[index]
                            : 1,
                        index: index,
                        selectionId: selectionIdBuilder.createSelectionId() as ISelectionId,
                        color: color,
                        textGroup: item
                    };
                });

            reducedTexts = WordCloud.getReducedText(texts, stopWords, settings);
            dataPoints = WordCloud.getDataPoints(reducedTexts, settings);

            return {
                dataView: dataView,
                settings: settings,
                texts: texts,
                dataPoints: dataPoints
            };
        }

        private static parseSettings(dataView: DataView, previousSettings: WordCloudSettings): WordCloudSettings {
            var settings: WordCloudSettings = WordCloudSettings.parse(dataView);

            settings.general.minFontSize = Math.max(settings.general.minFontSize, 1);
            settings.general.maxFontSize = Math.max(settings.general.maxFontSize, 1);
            settings.general.maxFontSize = Math.max(
                settings.general.maxFontSize,
                settings.general.minFontSize);

            settings.rotateText.minAngle = Math.max(
                Math.min(settings.rotateText.minAngle, WordCloud.MaxAngle),
                WordCloud.MinAngle);

            settings.rotateText.maxAngle = Math.max(
                Math.min(settings.rotateText.maxAngle, WordCloud.MaxAngle),
                WordCloud.MinAngle);

            settings.rotateText.maxAngle = Math.max(
                settings.rotateText.maxAngle,
                settings.rotateText.minAngle);

            settings.general.maxNumberOfWords = Math.max(
                Math.min(settings.general.maxNumberOfWords, WordCloud.MaxNumberOfWords), 1);

            settings.rotateText.maxNumberOfOrientations = Math.max(
                Math.min(settings.rotateText.maxNumberOfOrientations, WordCloud.MaxNumberOfWords), 1);

            // settings.createOriginalSettings(); // TODO: check it

            return settings;
        }

        private static getReducedText(
            texts: WordCloudText[],
            stopWords: string[],
            settings: WordCloudSettings): WordCloudText[][] {

            var brokenStrings: WordCloudText[] = WordCloud.getBrokenWords(texts, stopWords, settings),
                result = <WordCloudText[][]>_.values(_.groupBy(brokenStrings, x => x.text));

            result = result.map(texts => _.sortBy(texts, x => x.textGroup.length));

            return result;
        }

        private static getBrokenWords(
            words: WordCloudText[],
            stopWords: string[],
            settings: WordCloudSettings): WordCloudText[] {

            var brokenStrings: WordCloudText[] = [],
                whiteSpaceRegExp: RegExp = /\s/,
                punctuatuinRegExp: RegExp = new RegExp(`[${WordCloud.Punctuation.join("\\")}]`, "gim");

            if (!settings.general.isBrokenText) {
                return words;
            }

            words.forEach((item: WordCloudText) => {
                if (typeof item.text === "string") {
                    var splittedWords: string[] = item.text
                        .replace(punctuatuinRegExp, " ")
                        .split(whiteSpaceRegExp);

                    if (settings.stopWords.show) {
                        splittedWords = splittedWords.filter((value: string) =>
                            value.length > 0 && !stopWords.some((removeWord: string) =>
                                value.toLocaleLowerCase() === removeWord.toLocaleLowerCase()));
                    }

                    splittedWords.forEach((splittedWord: string) => {
                        if (splittedWord.length === 0 || whiteSpaceRegExp.test(splittedWord)) {
                            return;
                        }

                        var existingWord = _.find(words, (word: WordCloudText) => {
                            return word.text.toString().toLocaleLowerCase() === splittedWord.toLocaleLowerCase();
                        });

                        if (existingWord && existingWord !== item) {
                            splittedWord = existingWord.text;
                        }

                        brokenStrings.push({
                            text: splittedWord,
                            textGroup: item.textGroup,
                            count: item.count,
                            index: item.index,
                            selectionId: item.selectionId,
                            color: item.color
                        });
                    });
                } else {
                    brokenStrings.push(item);
                }
            });

            return brokenStrings;
        }

        private static getDataPoints(
            textGroups: WordCloudText[][],
            settings: WordCloudSettings): WordCloudDataPoint[] {

            if (_.isEmpty(textGroups)) {
                return [];
            }

            var returnValues = textGroups.map((values: WordCloudText[]) => {
                return <WordCloudDataPoint>{
                    text: values[0].text,
                    x: 0,
                    y: 0,
                    rotate: WordCloud.getAngle(settings),
                    padding: 1,
                    width: 0,
                    height: 0,
                    xOff: 0,
                    yOff: 0,
                    x0: 0,
                    y0: 0,
                    x1: 0,
                    y1: 0,
                    color: values[0].color,
                    selectionIds: values.map(x => x.selectionId),
                    wordIndex: values[0].index,
                    count: _.sumBy(values, x => x.count)
                };
            });

            var minValue = _.minBy(returnValues, x => x.count).count,
                maxValue = _.maxBy(returnValues, x => x.count).count,
                texts = textGroups.map(x => x[0]);

            returnValues.forEach((dataPoint: WordCloudDataPoint) => {
                dataPoint.size = WordCloud.getWordFontSize(texts, settings, dataPoint.count, minValue, maxValue);
            });

            return returnValues.sort((a, b) => b.count - a.count);
        }

        private static getWordFontSize(
            texts: WordCloudText[],
            settings: WordCloudSettings,
            value: number,
            minValue: number,
            maxValue: number,
            scaleType: WordCloudScaleType = WordCloudScaleType.value) {

            var weight: number, fontSize: number,
                minFontSize: number = settings.general.minFontSize * WordCloud.FontSizePercentageCoefficent,
                maxFontSize: number = settings.general.maxFontSize * WordCloud.FontSizePercentageCoefficent;

            if (texts.length < 2) {
                return maxFontSize;
            }

            switch (scaleType) {
                case WordCloudScaleType.logn: {
                    weight = Math.log(value);
                }
                case WordCloudScaleType.sqrt: {
                    weight = Math.sqrt(value);
                }
                case WordCloudScaleType.value: {
                    weight = value;
                }
            }

            if (weight > minValue) {
                fontSize = (maxValue - minValue) !== 0
                    ? (maxFontSize * (weight - minValue)) / (maxValue - minValue)
                    : 0;
            } else {
                fontSize = 0;
            }

            fontSize = (fontSize * 100) / maxFontSize;

            fontSize = (fontSize * (maxFontSize - minFontSize)) / 100 + minFontSize;

            return fontSize;
        }

        private static getAngle(settings: WordCloudSettings): number {
            if (!settings.rotateText.show) {
                return 0;
            }

            var angle = ((settings.rotateText.maxAngle - settings.rotateText.minAngle)
                / settings.rotateText.maxNumberOfOrientations)
                * Math.floor(Math.random() * settings.rotateText.maxNumberOfOrientations);

            return settings.rotateText.minAngle + angle;
        }

        private get settings(): WordCloudSettings {
            return this.data && this.data.settings;
        }

        private data: WordCloudData;
        private durationAnimations: number = 500;
        private specialViewport: IViewport;

        private fakeViewport: IViewport = {
            width: 1500,
            height: 1000
        };

        private canvasViewport: IViewport = {
            width: 128,
            height: 2048
        };

        private colors: IColorPalette;
        private root: Selection<any>;
        private svg: Selection<any>;
        private main: Selection<any>;
        private wordsContainerSelection: Selection<any>;
        private wordsGroupUpdateSelection: UpdateSelection<any>;
        private wordsTextUpdateSelection: UpdateSelection<any>;

        /**
         * Public for testability.
         */
        public canvas: HTMLCanvasElement;

        private fontFamily: string;

        private layout: VisualLayout;

        private hostService: IVisualHost;
        private selectionManager: ValueSelectionManager<string>;

        private visualUpdateOptions: VisualUpdateOptions;

        private isUpdating: boolean;
        private incomingUpdateOptions: VisualUpdateOptions;

        private oldIdentityKeys: string[];

        constructor(options?: WordCloudConstructorOptions) {
            if (options) {
                this.svg = options.svg || this.svg;
                this.layout = new VisualLayout(null, options.margin || WordCloud.DefaultMargin);

                // if (options.animator) {
                //     // this.animator = options.animator;
                // }
            }

            this.isUpdating = false;
        }

        public init(options: VisualConstructorOptions): void {
            if (this.svg) {
                this.root = this.svg;
            } else {
                // this.root = d3.select(options.element.get(0)).append("svg"); // TODO: check it
            }

            // this.colors = options.style.colorPalette.dataColors; // TODO: Check it
            this.hostService = options.host;

            this.selectionManager = new ValueSelectionManager<string>(this.hostService, w => {
                var dataPoints = this.data && this.data.dataPoints && this.data.dataPoints.filter(x => x.text === w);

                return dataPoints && dataPoints[0] && dataPoints[0].selectionIds;
            });

            this.layout = new VisualLayout(null, WordCloud.DefaultMargin);

            this.root.classed(WordCloud.ClassName, true);

            this.root.on("click", () => {
                this.setSelection(null);
            });

            this.fontFamily = this.root.style("font-family");

            this.main = this.root.append("g");

            this.wordsContainerSelection = this.main
                .append("g")
                .classed(WordCloud.Words["class"], true);

            this.canvas = document.createElement("canvas");
        }

        public update(visualUpdateOptions: VisualUpdateOptions): void {
            if (!visualUpdateOptions ||
                !visualUpdateOptions.viewport ||
                !visualUpdateOptions.dataViews ||
                !visualUpdateOptions.dataViews[0] ||
                !visualUpdateOptions.viewport ||
                !(visualUpdateOptions.viewport.height >= 0) ||
                !(visualUpdateOptions.viewport.width >= 0)) {

                return;
            }

            if (visualUpdateOptions !== this.visualUpdateOptions) {
                this.incomingUpdateOptions = visualUpdateOptions;
            }

            if (!this.isUpdating && (this.incomingUpdateOptions !== this.visualUpdateOptions)) {
                this.visualUpdateOptions = this.incomingUpdateOptions;
                this.layout.viewport = this.visualUpdateOptions.viewport;

                var dataView: DataView = visualUpdateOptions.dataViews[0];

                if (this.layout.viewportInIsZero) {
                    return;
                }

                /*this.durationAnimations = getAnimationDuration(
                    this.animator,
                    visualUpdateOptions.suppressAnimations);*/ // TODO: check it

                this.updateSize();

                var data = WordCloud.converter(dataView, this.colors, this.data);
                if (!data) {
                    this.clear();
                    return;
                }

                this.data = data;

                this.computePositions((wordCloudDataView: WordCloudDataView) => this.render(wordCloudDataView));
            }
        }

        private clear() {
            this.main
                .select(WordCloud.Words.selector)
                .selectAll(WordCloud.WordGroup.selector)
                .remove();
        }

        private computePositions(onPositionsComputed: (WordCloudDataView) => void): void {
            var words: WordCloudDataPoint[] = this.data.dataPoints;

            if (_.isEmpty(words)) {
                this.clear();

                return;
            }

            requestAnimationFrame(() => {
                var surface: number[] = _.range(0, (this.specialViewport.width >> 5) * this.specialViewport.height, 0),
                    canvasContext: CanvasRenderingContext2D;

                words.forEach((dataPoint: WordCloudDataPoint) => {
                    dataPoint.getWidthOfWord = () =>
                        dataPoint.widthOfWord
                        ||
                        (dataPoint.widthOfWord = TextMeasurementService.measureSvgTextWidth({
                            fontFamily: this.fontFamily,
                            fontSize: (dataPoint.size + 1) + WordCloud.Size,
                            text: dataPoint.text
                        }) + 2);
                });

                canvasContext = this.getCanvasContext();

                if (canvasContext) {
                    this.computeCycle(
                        words,
                        canvasContext,
                        surface,
                        null,
                        onPositionsComputed,
                        [],
                        0);
                }
            });
        }

        private computeCycle(
            words: WordCloudDataPoint[],
            context: CanvasRenderingContext2D,
            surface: number[],
            borders: IPoint[],
            onPositionsComputed: (WordCloudDataView) => void,
            wordsForDraw: WordCloudDataPoint[] = [],
            index: number = 0): void {

            var word: WordCloudDataPoint = words[index],
                ratio: number = 1;

            if (words.length <= 10) {
                ratio = 5;
            }
            else if (words.length <= 25) {
                ratio = 3;
            }
            else if (words.length <= 75) {
                ratio = 1.5;
            }
            else if (words.length <= 100) {
                ratio = 1.25;
            }

            word.x = (this.specialViewport.width / ratio * (Math.random() + 0.5)) >> 1;
            word.y = (this.specialViewport.height / ratio * (Math.random() + 0.5)) >> 1;

            if (!word.sprite) {
                this.generateSprites(context, words, index);
            }

            if (word.sprite && this.findPosition(surface, word, borders)) {
                wordsForDraw.push(word);

                borders = this.updateBorders(word, borders);
                word.x -= this.specialViewport.width >> 1;
                word.y -= this.specialViewport.height >> 1;

                if (wordsForDraw.length >= this.settings.general.maxNumberOfWords) {
                    index = words.length - 1;
                }
            }

            if (++index < words.length && this.root) {
                this.computeCycle(words, context, surface, borders, onPositionsComputed, wordsForDraw, index);
            } else {
                onPositionsComputed({
                    data: wordsForDraw,
                    leftBorder: borders && borders[0],
                    rightBorder: borders && borders[1]
                });
            }
        }

        private updateBorders(word: WordCloudDataPoint, borders: IPoint[]): IPoint[] {
            if (borders && borders.length === 2) {
                var leftBorder: IPoint = borders[0],
                    rightBorder: IPoint = borders[1];

                if (word.x + word.x0 < leftBorder.x)
                    leftBorder.x = word.x + word.x0;

                if (word.y + word.y0 < leftBorder.y)
                    leftBorder.y = word.y + word.y0;

                if (word.x + word.x1 > rightBorder.x)
                    rightBorder.x = word.x + word.x1;

                if (word.y + word.y1 > rightBorder.y)
                    rightBorder.y = word.y + word.y1;
            } else {
                borders = [
                    {
                        x: word.x + word.x0,
                        y: word.y + word.y0
                    }, {
                        x: word.x + word.x1,
                        y: word.y + word.y1
                    }
                ];
            }

            return borders;
        }

        private generateSprites(
            context: CanvasRenderingContext2D,
            words: WordCloudDataPoint[],
            startIndex: number): void {

            context.clearRect(0, 0, this.canvasViewport.width << 5, this.canvasViewport.height);

            var x: number = 0,
                y: number = 0,
                maxHeight: number = 0;

            for (var i: number = startIndex, length = words.length; i < length; i++) {
                var currentWordData: WordCloudDataPoint = words[i],
                    widthOfWord: number = currentWordData.getWidthOfWord(),
                    heightOfWord: number = currentWordData.size << 1;

                if (currentWordData.rotate) {
                    var sr: number = Math.sin(currentWordData.rotate * WordCloud.Radians),
                        cr: number = Math.cos(currentWordData.rotate * WordCloud.Radians),
                        widthCr: number = widthOfWord * cr,
                        widthSr: number = widthOfWord * sr,
                        heightCr: number = heightOfWord * cr,
                        heightSr: number = heightOfWord * sr;

                    widthOfWord = (Math.max(
                        Math.abs(widthCr + heightSr),
                        Math.abs(widthCr - heightSr)) + 31) >> 5 << 5;

                    heightOfWord = Math.floor(Math.max(
                        Math.abs(widthSr + heightCr),
                        Math.abs(widthSr - heightCr)));
                } else {
                    widthOfWord = (widthOfWord + 31) >> 5 << 5;
                }

                if (heightOfWord > maxHeight) {
                    maxHeight = heightOfWord;
                }

                if (x + widthOfWord >= (this.canvasViewport.width << 5)) {
                    x = 0;
                    y += maxHeight;
                    maxHeight = 0;
                }

                context.save();

                context.font = "normal normal "
                    + (currentWordData.size + 1)
                    + WordCloud.Size
                    + " "
                    + this.fontFamily;

                context.translate((x + (widthOfWord >> 1)), (y + (heightOfWord >> 1)));

                if (currentWordData.rotate) {
                    context.rotate(currentWordData.rotate * WordCloud.Radians);
                }

                context.fillText(currentWordData.text, 0, 0);

                if (currentWordData.padding) {
                    context.lineWidth = 2 * currentWordData.padding;
                    context.strokeText(currentWordData.text, 0, 0);
                }

                context.restore();

                currentWordData.width = widthOfWord;
                currentWordData.height = heightOfWord;
                currentWordData.xOff = x;
                currentWordData.yOff = y;
                currentWordData.x1 = widthOfWord >> 1;
                currentWordData.y1 = heightOfWord >> 1;
                currentWordData.x0 = -currentWordData.x1;
                currentWordData.y0 = -currentWordData.y1;

                x += widthOfWord;
            }

            this.setSprites(context, words);
        }

        private setSprites(context: CanvasRenderingContext2D, words: WordCloudDataPoint[]) {
            var pixels: Uint8ClampedArray,
                sprites: number[] = [];

            pixels = context.getImageData(
                0,
                0,
                this.canvasViewport.width << 5,
                this.canvasViewport.height).data;

            for (var i = words.length - 1; i >= 0; i--) {
                var currentWordData: WordCloudDataPoint = words[i],
                    width: number = currentWordData.width,
                    width32: number = width >> 5,
                    height: number = currentWordData.y1 - currentWordData.y0,
                    x: number = 0,
                    y: number = 0,
                    seen: number = 0,
                    seenRow: number = 0;

                if (currentWordData.xOff + width >= (this.canvasViewport.width << 5) ||
                    currentWordData.yOff + height >= this.canvasViewport.height) {
                    currentWordData.sprite = null;

                    continue;
                }

                for (var j = 0; j < height * width32; j++) {
                    sprites[j] = 0;
                }

                if (currentWordData.xOff !== null) {
                    x = currentWordData.xOff;
                } else {
                    return;
                }

                y = currentWordData.yOff;

                seen = 0;
                seenRow = -1;

                for (var j = 0; j < height; j++) {
                    for (var k = 0; k < width; k++) {
                        var l: number = width32 * j + (k >> 5),
                            index: number = ((y + j) * (this.canvasViewport.width << 5) + (x + k)) << 2,
                            m: number = pixels[index]
                                ? 1 << (31 - (k % 32))
                                : 0;

                        sprites[l] |= m;
                        seen |= m;
                    }

                    if (seen) {
                        seenRow = j;
                    } else {
                        currentWordData.y0++;
                        height--;
                        j--;
                        y++;
                    }
                }

                currentWordData.y1 = currentWordData.y0 + seenRow;
                currentWordData.sprite = sprites.slice(0, (currentWordData.y1 - currentWordData.y0) * width32);
            }
        }

        private findPosition(surface: number[], word: WordCloudDataPoint, borders: IPoint[]): boolean {
            var startPoint: IPoint = { x: word.x, y: word.y },
                delta = Math.sqrt(
                    this.specialViewport.width * this.specialViewport.width
                    +
                    this.specialViewport.height * this.specialViewport.height),
                point: IPoint,
                dt: number = Math.random() < 0.5 ? 1 : -1,
                shift: number = -dt,
                dx: number,
                dy: number;

            while (true) {
                shift += dt;

                point = this.archimedeanSpiral(shift);

                dx = Math.floor(point.x);
                dy = Math.floor(point.y);

                if (Math.min(Math.abs(dx), Math.abs(dy)) >= delta) {
                    break;
                }

                word.x = startPoint.x + dx;
                word.y = startPoint.y + dy;

                if (word.x + word.x0 < 0 ||
                    word.y + word.y0 < 0 ||
                    word.x + word.x1 > this.specialViewport.width ||
                    word.y + word.y1 > this.specialViewport.height) {

                    continue;
                }

                if (!borders || !this.checkIntersect(word, surface)) {
                    if (!borders || this.checkIntersectOfRectangles(word, borders[0], borders[1])) {
                        var sprite: number[] = word.sprite,
                            width: number = word.width >> 5,
                            shiftWidth: number = this.specialViewport.width >> 5,
                            lx: number = word.x - (width << 4),
                            sx: number = lx & 127,
                            msx: number = 32 - sx,
                            height: number = word.y1 - word.y0,
                            x: number = (word.y + word.y0) * shiftWidth + (lx >> 5);

                        for (var i: number = 0; i < height; i++) {
                            var lastSprite: number = 0;

                            for (var j: number = 0; j <= width; j++) {
                                var leftMask: number = lastSprite << msx,
                                    rightMask: number;

                                if (j < width)
                                    lastSprite = sprite[i * width + j];

                                rightMask = j < width
                                    ? lastSprite >>> sx
                                    : 0;

                                surface[x + j] |= leftMask | rightMask;
                            }

                            x += shiftWidth;
                        }

                        word.sprite = null;

                        return true;
                    }
                }
            }

            return false;
        }

        private archimedeanSpiral(value: number): IPoint {
            var ratio: number = this.specialViewport.width / this.specialViewport.height;

            value = value * 0.1;

            return {
                x: ratio * value * Math.cos(value),
                y: value * Math.sin(value)
            };
        }

        private checkIntersect(word: WordCloudDataPoint, surface: number[]): boolean {
            var shiftWidth: number = this.specialViewport.width >> 5,
                sprite: number[] = word.sprite,
                widthOfWord: number = word.width >> 5,
                lx: number = word.x - (widthOfWord << 4),
                sx: number = lx & 127,
                msx: number = 32 - sx,
                heightOfWord: number = word.y1 - word.y0,
                x: number = (word.y + word.y0) * shiftWidth + (lx >> 5);

            for (var i = 0; i < heightOfWord; i++) {
                var lastSprite: number = 0;

                for (var j = 0; j <= widthOfWord; j++) {
                    var mask: number = 0,
                        leftMask: number,
                        intersectMask: number = 0;

                    leftMask = lastSprite << msx;

                    if (j < widthOfWord)
                        lastSprite = sprite[i * widthOfWord + j];

                    mask = j < widthOfWord
                        ? lastSprite >>> sx
                        : 0;

                    intersectMask = (leftMask | mask) & surface[x + j];

                    if (intersectMask)
                        return true;
                }

                x += shiftWidth;
            }

            return false;
        }

        private checkIntersectOfRectangles(
            word: WordCloudDataPoint,
            leftBorder: IPoint,
            rightBorder: IPoint): boolean {

            return (word.x + word.x1) > leftBorder.x
                && (word.x + word.x0) < rightBorder.x
                && (word.y + word.y1) > leftBorder.y
                && (word.y + word.y0) < rightBorder.y;
        }

        /**
         * Returns a CanvasRenderingContext2D to compute size of the text.
         * 
         * Public for testability.
         */
        public getCanvasContext(): CanvasRenderingContext2D {
            if (!this.canvasViewport || !this.canvas) {
                return null;
            }

            this.canvas.width = 1;
            this.canvas.height = 1;

            var context: CanvasRenderingContext2D = this.canvas.getContext("2d");

            this.canvas.width = this.canvasViewport.width << 5;
            this.canvas.height = this.canvasViewport.height;

            context = this.canvas.getContext("2d");

            context.fillStyle = context.strokeStyle = "red";
            context.textAlign = "center";

            return context;
        }

        private updateSize(): void {
            var fakeWidth: number,
                fakeHeight: number,
                ratio: number;

            ratio = Math.sqrt((this.fakeViewport.width * this.fakeViewport.height)
                / (this.layout.viewportIn.width * this.layout.viewportIn.height));

            if (isNaN(ratio)) {
                fakeHeight = fakeWidth = 1;
            } else {
                fakeHeight = this.layout.viewportIn.height * ratio;
                fakeWidth = this.layout.viewportIn.width * ratio;
            }

            this.specialViewport = {
                height: fakeHeight,
                width: fakeWidth
            };

            this.root.attr({
                "height": this.layout.viewport.height,
                "width": this.layout.viewport.width
            });
        }

        private render(wordCloudDataView: WordCloudDataView): void {
            if (!wordCloudDataView || !wordCloudDataView.data) {
                return;
            }

            this.scaleMainView(wordCloudDataView);

            this.wordsGroupUpdateSelection = this.main
                .select(WordCloud.Words.selector)
                .selectAll("g")
                .data(wordCloudDataView.data);

            var wordGroupEnterSelection = this.wordsGroupUpdateSelection
                .enter()
                .append("svg:g")
                .classed(WordCloud.WordGroup.class, true);

            wordGroupEnterSelection
                .append("svg:text")
                .style("font-size", "1px");

            wordGroupEnterSelection
                .append("svg:rect");

            this.wordsGroupUpdateSelection
                .exit()
                .remove();

            this.wordsGroupUpdateSelection
                .attr('transform', (dataPoint: WordCloudDataPoint) => {
                    return `${SVGUtil.translate(dataPoint.x, dataPoint.y)} rotate(${dataPoint.rotate})`;
                })
                .sort((a: WordCloudDataPoint, b: WordCloudDataPoint) => b.height * b.width - a.height * a.width);

            this.wordsTextUpdateSelection = this.wordsGroupUpdateSelection
                .selectAll("text")
                .data((dataPoint: WordCloudDataPoint) => [dataPoint]);

            this.wordsTextUpdateSelection.text((d: WordCloudDataPoint) => d.text);

            this.animateSelection(this.wordsTextUpdateSelection, this.durationAnimations)
                .style({
                    "font-size": ((item: WordCloudDataPoint): string => `${item.size}${WordCloud.Size}`),
                    "fill": ((item: WordCloudDataPoint): string => item.color),
                });

            this.wordsGroupUpdateSelection
                .selectAll("rect")
                .data((dataPoint: WordCloudDataPoint) => [dataPoint])
                .attr({
                    x: (d: WordCloudDataPoint) => -d.getWidthOfWord() * 0.5,
                    width: (d: WordCloudDataPoint) => d.getWidthOfWord(),
                    y: (d: WordCloudDataPoint) => -d.size * 0.75,
                    height: (d: WordCloudDataPoint) => d.size * 0.85,
                    fill: (d: WordCloudDataPoint) => "rgba(63, 191, 191, 0.0)",
                })
                .on("click", (dataPoint: WordCloudDataPoint) => {
                    (d3.event as MouseEvent).stopPropagation();

                    this.setSelection(dataPoint);
                });

            this.clearIntorrectSelection(this.data.dataView);
            this.renderSelection();

            this.isUpdating = false;

            if (this.incomingUpdateOptions !== this.visualUpdateOptions) {
                this.update(this.incomingUpdateOptions);
            }
        }

        private clearIntorrectSelection(dataView: DataView) {
            var categories: DataViewCategoryColumn[],
                identityKeys: string[],
                oldIdentityKeys: string[] = this.oldIdentityKeys;

            categories = dataView
                && dataView.categorical
                && dataView.categorical.categories;

            identityKeys = categories
                && categories[0]
                && categories[0].identity
                && categories[0].identity.map((identity: DataViewScopeIdentity) => identity.key);

            this.oldIdentityKeys = identityKeys;

            if (oldIdentityKeys && oldIdentityKeys.length > identityKeys.length) {
                this.selectionManager.clear(false);

                return;
            }

            if (!_.isEmpty(identityKeys)) {
                var incorrectValues = this.selectionManager.getSelectionIdValues.filter(x =>
                    x.selectionId.some(s => _.includes(identityKeys, s.getKey())));

                incorrectValues.forEach(v => this.selectionManager.selectedValues
                    .splice(this.selectionManager.selectedValues.indexOf(v.value), 1));
            }
        }

        private setSelection(dataPoint: WordCloudDataPoint) {
            if (!dataPoint) {
                this.selectionManager
                    .clear(true)
                    .then(() => this.renderSelection());

                return;
            }

            this.selectionManager
                .selectAndSendSelection(
                dataPoint.text,
                (d3.event as MouseEvent).ctrlKey)
                .then(() => this.renderSelection());
        }

        private scaleMainView(wordCloudDataView: WordCloudDataView) {
            var rectangles: ClientRect[] = wordCloudDataView.data.map((dataPoint: WordCloudDataPoint) => {
                var hw: number = dataPoint.width / 2,
                    hh: number = dataPoint.height / 2;

                return <ClientRect>{
                    left: dataPoint.x - hw,
                    top: dataPoint.y - hh,
                    right: dataPoint.x + hw,
                    bottom: dataPoint.y + hh
                };
            });

            if (_.isEmpty(rectangles)) {
                return;
            }

            var rectangle: ClientRect = <ClientRect>{
                left: _.minBy(rectangles, x => x.left).left,
                top: _.minBy(rectangles, x => x.top).top,
                right: _.maxBy(rectangles, x => x.right).right,
                bottom: _.maxBy(rectangles, x => x.bottom).bottom
            };

            var rectWidth = rectangle.right - rectangle.left;
            var rectHeight = rectangle.bottom - rectangle.top;

            var scaleByX: number = this.layout.viewportIn.width / (rectWidth),
                scaleByY: number = this.layout.viewportIn.height / (rectHeight);

            var scale: number = Math.min(scaleByX, scaleByY);

            var x: number = -rectangle.left * scale + 5,
                y: number = -rectangle.top * scale + 5;

            /**
             * Note: This construction fixes bug #6343.
             * Edge renders words out of the canvas, so we use this hack to fix it.
             * The line-height doesn't work with svg, but it call the render cycle of the browser.
             */
            this.main
                .style("line-height", "5px"); // Note: This construction fixes bug #6343.

            this.main
                .attr("transform", `${SVGUtil.translate(x, y)} scale(${scale})`)
                .style("line-height", "10px"); // Note: This construction fixes bug #6343.
        }

        private renderSelection(): void {
            if (!this.wordsTextUpdateSelection) {
                return;
            }

            if (!this.selectionManager.hasSelection) {
                this.setOpacity(this.wordsTextUpdateSelection, WordCloud.MaxOpacity);

                return;
            }

            var selectedColumns = this.wordsTextUpdateSelection.filter((dataPoint: WordCloudDataPoint) => {
                return this.selectionManager.isSelected(dataPoint.text);
            });

            this.setOpacity(this.wordsTextUpdateSelection, WordCloud.MinOpacity);
            this.setOpacity(selectedColumns, WordCloud.MaxOpacity);
        }

        private setOpacity(element: Selection<any>, opacityValue: number): void {
            element.style("fill-opacity", opacityValue);

            if (this.main) { // Note: This construction fixes bug #6343.
                this.main.style("line-height", "14px");

                this.animateSelection(this.main, 0, this.durationAnimations)
                    .style("line-height", "15px");
            }
        }

        // TODO: check it
        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions) {
            // var instances = WordCloudSettings.enumerateObjectInstances(
            //     this.settings && this.settings.originalSettings,
            //     options,
            //     WordCloud.capabilities);

            // switch (options.objectName) {
            //     case "dataPoint":
            //         if (this.data && this.data.dataPoints) {
            //             var wordCategoriesIndex: number[] = [];

            //             _.uniqBy(this.data.dataPoints, x => x.wordIndex).forEach((item: WordCloudDataPoint) => {
            //                 if (wordCategoriesIndex.indexOf(item.wordIndex) === -1) {
            //                     wordCategoriesIndex.push(item.wordIndex);

            //                     instances.pushInstance({
            //                         objectName: options.objectName,
            //                         displayName: this.data.texts[item.wordIndex].text,
            //                         selector: ColorHelper.normalizeSelector(item.selectionIds[0].getSelector(), false),
            //                         properties: { fill: { solid: { color: item.color } } }
            //                     });
            //                 }
            //             });
            //         }

            //         break;
            // }

            // return instances.complete() || [];
        }

        private animateSelection<T extends Selection<any>>(
            element: T,
            duration: number = 0,
            delay: number = 0,
            callback?: (data: any, index: number) => void): Transition<any> {

            return element
                .transition()
                .delay(delay)
                .duration(duration)
                .each("end", callback);
        }

        public destroy(): void {
            this.root = null;
            this.canvas = null;
        }
    }

    module wordCloudUtils {
        export function hexToRgb(hex: string): string {
            // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
            var shorthandRegex: RegExp = /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
                result: RegExpExecArray;

            hex = hex.replace(shorthandRegex, (m, r, g, b) => {
                return r + r + g + g + b + b;
            });

            result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

            return result
                ? `rgb(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)})`
                : null;
        }

        export function getRandomColor(): string {
            var red: number = Math.floor(Math.random() * 255),
                green: number = Math.floor(Math.random() * 255),
                blue: number = Math.floor(Math.random() * 255);

            return `rgb(${red},${green},${blue})`;
        }
    }
}