import * as React from "react";
import * as OSS from "ali-oss";

import "./RealtimeRoom.less";

import LikeIcon from "../assets/image/like.svg";
import ArrowIcon from "../assets/image/arrow.svg";

import TweenOne from "rc-tween-one";
import Dropzone from "react-dropzone";
import TopLoadingBar from "@netless/react-loading-bar";
import ToolBox from "@netless/react-tool-box";

import MenuHotKey from "./MenuHotKey";
import MenuBox from "./MenuBox";
import MenuAnnexBox from "./MenuAnnexBox";
import MenuPPTDoc from "./MenuPPTDoc";
import UploadBtn from "./UploadBtn";

import WhiteboardTopLeft from "./WhiteboardTopLeft";
import WhiteboardTopRight from "./WhiteboardTopRight";
import WhiteboardBottomLeft from "./WhiteboardBottomLeft";
import WhiteboardBottomRight from "./WhiteboardBottomRight";

import {
    RoomWhiteboard,
    Room,
    RoomState,
    RoomPhase,
    MemberState,
    ViewMode,
} from "white-react-sdk";

import {message} from "antd";
import {PPTProgressPhase, UploadManager} from "@netless/oss-upload-manager";
import {IAnimObject} from "rc-tween-one/typings/AnimObject";
import {UserPayload} from "../common/UserPayload";

function sleep(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
}

export enum MenuInnerType {
    HotKey = "HotKey",
    AnnexBox = "AnnexBox",
    PPTBox = "PPTBox",
}

export type WhiteboardPageProps = {
    readonly room: Room;
    readonly roomToken: string;
    readonly oss: OSS;
    readonly userPayload: UserPayload;
    readonly phase: RoomPhase;
    readonly roomState: RoomState;
};

export type WhiteboardPageState = {
    readonly isHandClap: boolean;
    readonly menuInnerState: MenuInnerType;
    readonly isMenuVisible: boolean;
    readonly ossPercent: number;
    readonly converterPercent: number;
    readonly isMenuOpen: boolean;
    readonly isMenuLeft?: boolean;

    // ref 后调用 setState 有问题
    readonly whiteboardLayerDownRef?: HTMLDivElement;
};

export default class WhiteboardPage extends React.Component<WhiteboardPageProps, WhiteboardPageState> {

    private readonly room: Room;
    private readonly oss: OSS;
    private readonly userPayload: UserPayload;

    public constructor(props: WhiteboardPageProps) {
        super(props);
        this.state = {
            isHandClap: false,
            menuInnerState: MenuInnerType.HotKey,
            isMenuVisible: false,
            ossPercent: 0,
            converterPercent: 0,
            isMenuOpen: false,
        };
        this.oss = props.oss;
        this.userPayload = props.userPayload;
        this.room = props.room;
        this.room.addMagixEventListener("handclap", this.onHandClap);
    }

    public componentWillMount(): void {
        window.addEventListener("resize", this.onWindowResize);
    }

    public componentWillUnmount(): void {
        window.removeEventListener("resize", this.onWindowResize);
    }

    private onWindowResize = (): void => {
        this.room.refreshViewSize();
    }

    private onHandClap = async (): Promise<void> => {
        this.setState({isHandClap: true});
        await sleep(800);
        this.setState({isHandClap: false});
    }

    private setWhiteboardLayerDownRef = (whiteboardLayerDownRef: HTMLDivElement): void => {
        this.setState({whiteboardLayerDownRef: whiteboardLayerDownRef});
    }

    private handleHotKeyMenuState = (): void => {
        this.setState({
            isMenuVisible: !this.state.isMenuVisible,
            menuInnerState: MenuInnerType.HotKey,
            isMenuLeft: false,
        });
    }

    private handleAnnexBoxMenuState = (): void => {
        this.setState({
            isMenuVisible: !this.state.isMenuVisible,
            menuInnerState: MenuInnerType.AnnexBox,
            isMenuLeft: false,
        });
    }

    private handlePPtBoxMenuState = (): void => {
        if (this.state.isMenuVisible) {
            this.setState({
                isMenuVisible: !this.state.isMenuVisible,
            });
        } else {
            this.setState({
                isMenuVisible: !this.state.isMenuVisible,
                menuInnerState: MenuInnerType.PPTBox,
                isMenuLeft: true,
            });
        }
    }

    private resetMenu = () => {
        this.setState({
            isMenuVisible: false,
            isMenuLeft: false,
        });
    }

    private isImageType = (type: string): boolean => {
        return type === "image/jpeg" || type === "image/png";
    }

    private onDropFiles = async (acceptedFiles: File[], rejectedFiles: File[],
                                 event: React.DragEvent<HTMLDivElement>): Promise<void> => {
        event.persist();
        try {
            const imageFiles = acceptedFiles.filter(file => this.isImageType(file.type));
            const uploadManager = new UploadManager(this.oss, this.room);
            await Promise.all([
                uploadManager.uploadImageFiles(imageFiles, event.clientX, event.clientY),
            ]);
        } catch (error) {
            this.room.setMemberState({
                currentApplianceName: "selector",
            });
        }
    }

    private progress = (phase: PPTProgressPhase, percent: number): void => {
        message.config({
            maxCount: 1,
        });
        switch (phase) {
            case PPTProgressPhase.Uploading: {
                this.setState({ossPercent: percent * 100});
                break;
            }
            case PPTProgressPhase.Converting: {
                this.setState({converterPercent: percent * 100});
                break;
            }
        }
    }

    private setMenuState = (state: boolean) => {
        this.setState({isMenuOpen: state});
    }

    private setMemberState = (modifyState: Partial<MemberState>) => {
        this.room.setMemberState(modifyState);
    }

    public render(): React.ReactNode {
        return (
            <div id="outer-container">
                <MenuBox setMenuState={this.setMenuState}
                         resetMenu={this.resetMenu}
                         pageWrapId={"page-wrap" }
                         outerContainerId={ "outer-container" }
                         isLeft={this.state.isMenuLeft}
                         isVisible={this.state.isMenuVisible}
                         menuInnerState={this.state.menuInnerState}>
                    {this.renderMenuInner()}
                </MenuBox>
                {this.renderPageWrapper()}
            </div>
        );
    }

    private renderMenuInner = (): React.ReactNode => {
        switch (this.state.menuInnerState) {
            case MenuInnerType.HotKey: {
                return (
                    <MenuHotKey handleHotKeyMenuState={this.handleHotKeyMenuState}/>
                );
            }
            case MenuInnerType.AnnexBox: {
                return (
                    <MenuAnnexBox room={this.room}
                                  roomState={this.props.roomState}
                                  isMenuOpen={this.state.isMenuOpen}
                                  handleAnnexBoxMenuState={this.handleAnnexBoxMenuState}/>
                );
            }
            case MenuInnerType.PPTBox: {
                return (
                    <MenuPPTDoc room={this.room}/>
                );
            }
            default: {
                return null;
            }
        }
    }

    private renderPageWrapper(): React.ReactNode {
        return (
            <div style={{backgroundColor: "white"}} id="page-wrap">
                <Dropzone accept={"image/*"}
                          disableClick={true}
                          onDrop={this.onDropFiles}
                          className="whiteboard-drop-upload-box">

                    <TopLoadingBar loadingPercent={this.state.ossPercent}/>
                    <TopLoadingBar style={{backgroundColor: "red"}} loadingPercent={this.state.converterPercent}/>

                    <div className="whiteboard-out-box">
                        {this.renderClipView()}
                        {this.renderRoundOperationViews()}
                        {this.renderToolsBar()}

                        <div onClick={this.handlePPtBoxMenuState}
                             className={(this.state.menuInnerState === MenuInnerType.PPTBox && this.state.isMenuVisible) ? "slide-box-active" : "slide-box"}>
                            <img src={ArrowIcon}/>
                        </div>
                        <div className="whiteboard-tool-layer-down"
                             ref={this.setWhiteboardLayerDownRef}>
                            <RoomWhiteboard room={this.room}
                                            style={{width: "100%", height: "100vh"}}/>
                        </div>
                    </div>
                </Dropzone>
            </div>
        );
    }

    private renderRoundOperationViews(): React.ReactNode {
        return (
            <React.Fragment>
                <WhiteboardTopLeft room={this.room}/>
                <WhiteboardTopRight room={this.room}
                                    roomState={this.props.roomState}
                                    userPayload={this.userPayload}/>
                <WhiteboardBottomLeft room={this.room}
                                      roomState={this.props.roomState}
                                      userPayload={this.userPayload}/>
                <WhiteboardBottomRight room={this.room}
                                       roomState={this.props.roomState}
                                       userPayload={this.userPayload}
                                       handleAnnexBoxMenuState={this.handleAnnexBoxMenuState}
                                       handleHotKeyMenuState={this.handleHotKeyMenuState}/>
            </React.Fragment>
        );
    }

    private renderToolsBar(): React.ReactNode {
        const isFollower = this.props.roomState.broadcastState.mode === ViewMode.Follower;
        const className = isFollower ? "whiteboard-tool-box-disable" : "whiteboard-tool-box"
        return (
            <div className={className}>
                <ToolBox setMemberState={this.setMemberState}
                         memberState={this.room.state.memberState}
                         customerComponent={[
                             <UploadBtn oss={this.oss}
                                        room={this.room}
                                        roomToken={this.props.roomToken}
                                        onProgress={this.progress}
                                        whiteboardRef={this.state.whiteboardLayerDownRef}/>,
                         ]}/>
            </div>
        );
    }

    private renderClipView = (): React.ReactNode => {
        if (this.state.isHandClap) {
            const animations: IAnimObject[] = [{
                scale: 1,
                duration: 360,
                ease: "easeInOutQuart",
            }, {
                opacity: 0,
                scale: 2,
                ease: "easeInOutQuart",
                duration: 400,
            }];
            const style: React.CSSProperties = {
                transform: "scale(0)",
                borderTopLeftRadius: 4,
            };
            return (
                <div className="whiteboard-box-gift-box">
                    <TweenOne animation={animations} style={style} className="whiteboard-box-gift-inner-box">
                        <img src={LikeIcon}/>
                    </TweenOne>
                </div>
            );
        } else {
            return null;
        }
    }
}
