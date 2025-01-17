/*
 * Copyright (C) 2022 SUSE LLC
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 *
 * To contact SUSE LLC about this file by physical or electronic mail, you may
 * find current contact information at www.suse.com.
 */

import cockpit from "cockpit";
import React, { useState } from "react";
import {
    Button,
    DataList,
    DataListItem,
    DataListToggle,
    DataListItemRow,
    DataListItemCells,
    DataListCell,
    DataListAction,
    DataListContent,
    Dropdown,
    DropdownItem,
    DropdownPosition,
    KebabToggle,
    Label,
    Modal,
    ModalVariant,
    Tooltip,
} from "@patternfly/react-core";
import {
    BugIcon,
    ExclamationTriangleIcon,
    InfoCircleIcon,
    PackageIcon,
} from "@patternfly/react-icons";
import { transactionsProxy } from "../tukit";
import { categoryProps, severityProps } from "../update";
import { linkify } from "../utils";

import "./UpdatesItem.scss";

const _ = cockpit.gettext;

const UpdateDetails = ({ u }) => {
    const [dialogVisible, setDialogVisible] = useState(false);
    return (
        <>
            <Button
                className="tukit-update-details-button"
                variant="plain"
                onClick={() => {
                    setDialogVisible(true);
                }}
            >
                <InfoCircleIcon />
            </Button>
            {dialogVisible && (
                <Modal
                    isOpen
                    variant={ModalVariant.medium}
                    title={_("Update Details")}
                    onClose={() => setDialogVisible(false)}
                    actions={[
                        <Button
                            key="close"
                            variant="primary"
                            onClick={() => {
                                setDialogVisible(false);
                            }}
                        >
                            {_("Close")}
                        </Button>,
                    ]}
                >
                    <DataList isCompact>
                        {Object.entries(u).map(([k, v]) => (
                            <DataListItem key={k}>
                                <DataListItemRow>
                                    <DataListItemCells
                                        dataListCells={[
                                            <DataListCell key="name" width={1}>
                                                <strong>{k}</strong>
                                            </DataListCell>,
                                            <DataListCell key="value" width={4}>
                                                <span className="tukit-update-details-text">
                                                    {linkify(v)}
                                                </span>
                                            </DataListCell>,
                                        ]}
                                    />
                                </DataListItemRow>
                            </DataListItem>
                        ))}
                    </DataList>
                </Modal>
            )}
        </>
    );
};

const UpdateItem = ({ u }) => {
    const icon = () => {
        if (u.kind === "package") return <PackageIcon />;
        else if (u.kind === "patch") return <BugIcon />;
        else return <InfoCircleIcon />;
    };
    const updateCells = (u) => {
        // package
        if (u.kind === "package")
            return [
                <DataListCell key="name">
                    <Tooltip
                        className="tukit-tooltip-pre"
                        isContentLeftAligned
                        maxWidth="30rem"
                        content={u.description}
                    >
                        <span>{u.name}</span>
                    </Tooltip>
                </DataListCell>,
                <DataListCell key="version">
                    <Tooltip content={_("New Version")}>
                        <span>{u.edition}</span>
                    </Tooltip>
                </DataListCell>,
                <DataListCell key="oldversion">
                    <Tooltip content={_("Old Version")}>
                        <span>{u["edition-old"]}</span>
                    </Tooltip>
                </DataListCell>,
            ];
        // patch
        return [
            <DataListCell key="name" width={3}>
                <Tooltip
                    className="tukit-tooltip-pre"
                    isContentLeftAligned
                    maxWidth="30rem"
                    content={u.description}
                >
                    <span>{u.name}</span>
                </Tooltip>
            </DataListCell>,
            <DataListCell key="summary" width={2}>
                {u.summary}
            </DataListCell>,
            <DataListCell key="details" width={2}>
                <Label isCompact {...categoryProps(u)}>
                    {u.category}
                </Label>
                <Label isCompact {...severityProps(u)}>
                    {u.severity}
                </Label>
            </DataListCell>,
        ];
    };
    return (
        <DataListItem>
            <DataListItemRow>
                <DataListItemCells
                    dataListCells={[
                        <DataListCell isIcon key="icon">
                            <Tooltip content={_(u.kind)}>{icon()}</Tooltip>
                        </DataListCell>,
                        ...updateCells(u),
                    ]}
                />
                <DataListAction isPlainButtonAction>
                    <UpdateDetails u={u} />
                </DataListAction>
            </DataListItemRow>
        </DataListItem>
    );
};

const UpdatesItem = ({ updates, setError, setDirty, setWaiting, waiting }) => {
    const [expanded, setExpanded] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const update = async (reboot) => {
        setWaiting(_("Installing updates..."));
        const proxy = transactionsProxy();

        function finishedHandler(ev, snapID, exitcode, output) {
            console.log("command finished");
            console.log(`exit ${exitcode}`);
            console.log(`output: ${output}`);
            setWaiting(null);
            setDirty(true);
            // run once (no {once: true} support in cockpit's event_mixin)
            proxy.removeEventListener("CommandExecuted", finishedHandler);
        }

        function errorHandler(ev, snapID, exitcode, output) {
            console.log(`exit ${exitcode}`);
            console.log(`output: ${output}`);
            setError(
                cockpit.format(
                    _("Error installing updates: command exited with code $0"),
                    exitcode
                )
            );
            setWaiting(null);
            // don't reload to not loose the error status
            // setDirty(true);
            // run once (no {once: true} support in cockpit's event_mixin)
            proxy.removeEventListener("Error", errorHandler);
        }

        proxy.wait(async () => {
            try {
                proxy.addEventListener("CommandExecuted", finishedHandler);
                proxy.addEventListener("Error", errorHandler);
                const cmd = "zypper --non-interactive up";
                const rebootMethod = reboot ? "systemd" : "none";
                // base: default, active or number of base snapshot
                // reboot: auto, rebootmgr, systemd, kured, kexec, none
                const snapID = await proxy.ExecuteAndReboot(
                    "default",
                    cmd,
                    rebootMethod
                );
                console.log(`new snapshot: ${snapID}`);
            } catch (e) {
                setWaiting(null);
                // this is "early" error returned directly from method
                setError(e.toString());
            }
        });
    };

    const updateAndReboot = () => {
        update(true);
    };
    const updateOnly = () => {
        update(false);
    };

    return (
        <DataListItem key="updates" isExpanded={expanded}>
            <DataListItemRow>
                <DataListToggle
                    onClick={() => {
                        setExpanded(!expanded);
                    }}
                    isExpanded={expanded}
                />
                <DataListItemCells
                    dataListCells={[
                        <DataListCell isIcon key="icon">
                            <ExclamationTriangleIcon
                                size="md"
                                color="var(--pf-global--warning-color--100)"
                            />
                        </DataListCell>,
                        <DataListCell key="description">
                            <b>
                                {cockpit.format(
                                    _("Available updates ($0)"),
                                    updates.length
                                )}
                            </b>
                        </DataListCell>,
                        <DataListCell key="date?" />,
                        <DataListCell key="labels?" />,
                        <DataListCell key="buttons">
                            <Button
                                variant="primary"
                                isDisabled={waiting}
                                onClick={() => {
                                    updateAndReboot();
                                }}
                                isSmall
                            >
                                {_("Update and Reboot")}
                            </Button>
                        </DataListCell>,
                    ]}
                />
                <DataListAction>
                    <Dropdown
                        isPlain
                        isOpen={menuOpen}
                        position={DropdownPosition.right}
                        toggle={
                            <KebabToggle
                                onToggle={() => {
                                    setMenuOpen(!menuOpen);
                                }}
                            />
                        }
                        dropdownItems={[
                            <DropdownItem
                                key="update"
                                isDisabled={waiting}
                                onClick={() => {
                                    updateOnly();
                                }}
                            >
                                {_("Update without Reboot")}
                            </DropdownItem>,
                        ]}
                    />
                </DataListAction>
            </DataListItemRow>
            <DataListContent hasNoPadding isHidden={!expanded}>
                <DataList isCompact>
                    {updates.map((u) => (
                        <UpdateItem key={u.name} u={u} />
                    ))}
                </DataList>
            </DataListContent>
        </DataListItem>
    );
};

export default UpdatesItem;
