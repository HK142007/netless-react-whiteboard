import {v1} from "uuid";

import {ApplianceNames, Room, LegacyPPTConverter, PPTKind, PPT} from "white-react-sdk";
import {MultipartUploadResult} from "ali-oss";

export type imageSize = {
    width: number,
    height: number,
};

export type NetlessImageFile = {
    width: number;
    height: number;
    file: File;
    coordinateX: number;
    coordinateY: number;
};

export type TaskType = {
    uuid: string,
    imageFile: NetlessImageFile;
};

export type PPTProgressListener = (phase: PPTProgressPhase, percent: number) => void;

export enum PPTProgressPhase {
    Uploading,
    Converting,
}

export class UploadManager {

    private readonly ossClient: any;
    private readonly room: Room;

    public constructor(ossClient: any, room: Room) {
        this.ossClient = ossClient;
        this.room = room;
    }

    private createUUID = (): string => {
        const uuid = v1();
        return uuid.replace(/-/g, "");
    }

    private getFileType = (fileName: string): string => {
        const index1 = fileName.lastIndexOf(".");
        const index2 = fileName.length;
        return fileName.substring(index1, index2);
    }

    public async convertFile(
        rawFile: File,
        pptConverter: LegacyPPTConverter,
        kind: PPTKind,
        target: {
            bucket: string,
            folder: string,
            prefix: string,
        },
        onProgress?: PPTProgressListener,
    ): Promise<void> {
        const filename = this.createUUID();
        const fileType = this.getFileType(rawFile.name);
        const path = `/${target.folder}/${filename}${fileType}`;
        const pptURL = await this.addFile(path, rawFile, onProgress);
        let res: PPT;
        if (kind === PPTKind.Static) {
            res = await pptConverter.convert({
                url: pptURL,
                kind: kind,
                region: (this.room as any).region, // TODO 等到升级到 2.11.0 应该将这个 as any 删掉
                onProgressUpdated: progress => {
                    if (onProgress) {
                        onProgress(PPTProgressPhase.Converting, progress);
                    }
                },
            } as any) // TODO 等到升级到 2.11.0 应该将这个 as any 删掉;
        } else {
            res = await pptConverter.convert({
                url: pptURL,
                kind: kind,
                region: (this.room as any).region, // TODO 等到升级到 2.11.0 应该将这个 as any 删掉
                onProgressUpdated: progress => {
                    if (onProgress) {
                        onProgress(PPTProgressPhase.Converting, progress);
                    }
                },
            } as any) // TODO 等到升级到 2.11.0 应该将这个 as any 删掉;
        }

        if (onProgress) {
            onProgress(PPTProgressPhase.Converting, 1);
        }
        this.room.putScenes(`/${filename}`, res.scenes);
        this.room.setScenePath(`/${filename}/${res.scenes[0].name}`);
    }

    private getImageSize(imageInnerSize: imageSize): imageSize {
        const windowSize: imageSize = {width: window.innerWidth, height: window.innerHeight};
        const widthHeightProportion: number = imageInnerSize.width / imageInnerSize.height;
        const maxSize: number = 960;
        if ((imageInnerSize.width > maxSize && windowSize.width > maxSize) || (imageInnerSize.height > maxSize && windowSize.height > maxSize)) {
            if (widthHeightProportion > 1) {
                return {
                    width: maxSize,
                    height: maxSize / widthHeightProportion,
                };
            } else {
                return {
                    width: maxSize * widthHeightProportion,
                    height: maxSize,
                };
            }
        } else {
            if (imageInnerSize.width > windowSize.width || imageInnerSize.height > windowSize.height) {
                if (widthHeightProportion > 1) {
                    return {
                        width: windowSize.width,
                        height: windowSize.width / widthHeightProportion,
                    };
                } else {
                    return {
                        width: windowSize.height * widthHeightProportion,
                        height: windowSize.height,
                    };
                }
            } else {
                return {
                    width: imageInnerSize.width,
                    height: imageInnerSize.height,
                };
            }
        }
    }

    public async uploadImageFiles(imageFiles: File[], x: number, y: number, onProgress?: PPTProgressListener): Promise<void> {
        const newAcceptedFilePromises = imageFiles.map(file => this.fetchWhiteImageFileWith(file, x, y));
        const newAcceptedFiles = await Promise.all(newAcceptedFilePromises);
        await this.uploadImageFilesArray(newAcceptedFiles, onProgress);
    }

    private fetchWhiteImageFileWith(file: File, x: number, y: number): Promise<NetlessImageFile> {
        return new Promise(resolve => {
            const image = new Image();
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                image.src = reader.result as string;
                image.onload = async () => {
                    const res = this.getImageSize(image);
                    const imageFile: NetlessImageFile = {
                        width: res.width,
                        height: res.height,
                        file: file,
                        coordinateX: x,
                        coordinateY: y,
                    };
                    resolve(imageFile);
                };
            };
        });
    }

    private async uploadImageFilesArray(imageFiles: NetlessImageFile[], onProgress?: PPTProgressListener): Promise<void> {
        if (imageFiles.length > 0) {

            const tasks: { uuid: string, imageFile: NetlessImageFile }[] = imageFiles.map(imageFile => {
                return {
                    uuid: v1(),
                    imageFile: imageFile,
                };
            });

            for (const {uuid, imageFile} of tasks) {
                const {x, y} = this.room.convertToPointInWorld({x: imageFile.coordinateX, y: imageFile.coordinateY});
                this.room.insertImage({
                    uuid: uuid,
                    centerX: x,
                    centerY: y,
                    width: imageFile.width,
                    height: imageFile.height,
                    locked: false,
                });
            }
            await Promise.all(tasks.map(task => this.handleUploadTask(task, onProgress)));
            this.room.setMemberState({
                currentApplianceName: ApplianceNames.selector,
            });
        }
    }

    private async handleUploadTask(task: TaskType, onProgress?: PPTProgressListener): Promise<void> {
        const fileUrl: string = await this.addFile(`${task.uuid}${task.imageFile.file.name}`, task.imageFile.file, onProgress);
        this.room.completeImageUpload(task.uuid, fileUrl);
    }


    private getFile = (name: string): string => {
        return this.ossClient.generateObjectUrl(name);
    }
    private addFile = async (path: string, rawFile: File, onProgress?: PPTProgressListener): Promise<string> => {
        const res: MultipartUploadResult = await this.ossClient.multipartUpload(
            path,
            rawFile,
            {
                progress: (p: any) => {
                    if (onProgress) {
                        onProgress(PPTProgressPhase.Uploading, p);
                    }
                },
            });
        if (res.res.status === 200) {
            return this.getFile(path);
        } else {
            throw new Error(`upload to ali oss error, status is ${res.res.status}`);
        }
    }
}
